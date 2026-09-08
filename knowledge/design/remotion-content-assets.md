# Content Asset Production

Use this when a launch needs videos, stills, store compositions, app previews, demo loops, social posts, ad variants or campaign assets. Classify the job before selecting a provider. This reference owns the shared asset brief and includes Remotion implementation guidance for jobs that select it.

Generation, composition, capture and licensed-media reuse are different operations. A selected provider implements the operation; its name does not establish output quality, rights, compatibility or execution. Remotion can compose real UI, permitted media, tokens, copy, data and captions. A generation provider can create supporting imagery when the job calls for it. Neither route makes an unsupported product claim true.

## Contents

- Route Decision
- Founder And License Gates
- Source Inputs
- Brand Consistency Before Production
- Versioned Asset Brief
- Technique Selection
- Project Shape
- Remotion Skill Routing
- Composition Standards
- Render Commands
- Asset QA
- Artifacts
- Common Failure Modes

## Route Decision

Select generation when:

- the asset requires new AI-generated visuals, mascots, product/lifestyle scenes, presenter/UGC ad generation, image-to-video, or creative exploration
- an explicitly selected provider covers the required operation and its access and spending authority are available
- generated supporting imagery serves the communication problem

Select composition when:

- the asset should be reproducible from product truth, screenshots, recordings, copy, tokens, or data
- many variants are needed: hooks, formats, dimensions, locales, CTAs, captions, App Store custom product pages, ads, or creator briefs
- real app UI must stay visible and distinguishable from generated supporting art
- reproducible composition serves the job; use Remotion only when it is the selected implementation

Do not create the asset yet when:

- Higgsfield was the intended paid route and the founder has not approved a fallback
- Remotion commercial-license eligibility is unclear for the business and the output is for commercial use
- the source app UI, screenshots, recordings, or asset rights are missing
- the asset would imply unsupported functionality, pricing, endorsements, outcomes, urgency, scarcity, or store claims
- the next step is public posting, scheduling, paid spend, or store upload without founder approval

An unavailable provider does not authorize a replacement. Preserve explicit
selection and use the existing capability handoff for missing runtime access.
Hosted guidance can describe the brief and proof required; it cannot claim a
local renderer, device or paid provider is installed or connected.

## Founder And License Gates

Load [`paid-tool-routing.md`](../operations/paid-tool-routing.md) before replacing Higgsfield with Remotion. Missing Higgsfield runtime access is not approval to use Remotion or another fallback.

Record the decision in `strategy/TOOL_DECISIONS.md`, `CONTENT_ASSETS.md`, or the relevant ops doc:

- intended route: Higgsfield, Remotion, founder-owned media, raw screenshots, or blocked
- why Remotion is appropriate for this asset
- founder approval for fallback if Higgsfield was intended
- Remotion license status or reason the render is evaluation-only
- source assets and rights status
- downstream surfaces affected: store, UGC, Fastlane, landing page, onboarding, app preview, ad, or creator brief

Remotion can be lower-cost, but it is not universally free for every commercial entity. Check the current Remotion license before commercial output. If the business appears to be outside free-license eligibility, stop for founder approval before buying a company license, using paid rendering infrastructure, or publishing the output.

## Source Inputs

Use truthful inputs before rendered embellishment:

- real app screenshots or recordings from MobAI, XcodeBuildMCP, simulator/device capture, Android emulator/ADB, or founder-owned captures
- `11_STAR_EXPERIENCE.md` for the magical moment, line of feasibility, and complete product experience the asset should express
- `DESIGN.md` tokens, typography, voice, shape, spacing, and banned aesthetics
- `design.md`, `product/ONBOARDING.md`, `APP_STORE_LISTING.md`, `revenue/REVENUE_OPS.md`, `analytics/ANALYTICS.md`, and legal docs for claim and pricing truth
- founder-owned logos, icons, photos, audio, and product media
- licensed or public-domain assets with source/license notes
- copy datasets for hooks, CTAs, captions, subtitles, localizations, or store page variants

Do not present generated mock UI as production UI. If a screenshot, app preview, or demo clip uses mock data or unfinished screens, label that status and keep it out of final store upload until the real app state is captured.

## Brand Consistency Before Production

For every generated still or video and every composition of product media,
read the accepted Anchor Brand Kit in `DESIGN.md` before drafting the asset.
Use its exact revision, linked kit assets, and explicit reference roles.
The procedure adapts [Amir Mushich's Brand System Builder](https://github.com/amirmushichge/brand-system-skill)
([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)) to the selected
provider. Optional [Motion Brief](https://github.com/amirmushichge/motion-brief)
guidance can structure a video brief; it does not choose the provider or grant
spending authority.

Record a generation brief in the existing `growth/content-assets/CONTENT_ASSETS.md`
asset entry before calling a model. Include the purpose and placement, output
size and duration when relevant, kit revision, exact fonts, reference roles,
approved product claims, elements allowed to change, forbidden changes, and
selected model. Obtain the applicable spending authority before paid generation.
Do not copy reference logos, unsupported claims, or another product's identity.

Save the produced file with the input references, provider/model, generation
parameters, and kit revision in the existing asset manifest. Independently
review identity, typography, product truth, crop, motion, and destination fit.
A scene reference must not override brand identity. Repair a failed asset and
review the new output before multiplying variants. Raw model output and a
correct manifest do not establish visual acceptance. The same procedure applies
to store frames, landing imagery, UGC, ads, and video; do not invent a separate
brand state store for each format.

## Versioned Asset Brief

New asset packets use `schema_version: "2"` in the existing
`growth/content-assets/manifest.json`. Existing unversioned arrays and version
`"1"` packets remain supported with their existing checks. Do not relabel a
legacy packet as version 2 without recording the required evidence. The default
for new work is the structured brief below, including for previously unknown
providers. A design-related phrase in a prompt is not a replacement.

Keep the existing asset fields (`asset_id`, `surface`, `route`, `status`,
`inputs`, `outputs`, `truth_constraints`, `approvals`, `license_status`). In
version 2, `dimensions` is `{ "width": 1080, "height": 1920 }` in output pixels.
Record positive `duration_seconds` for video kinds.

| Field | Required meaning |
| --- | --- |
| `production_kind` | `generated`, `composed`, `captured` or `licensed`. The operation class is independent of `route`, which records the selected provider. |
| `asset_kind` | `still`, `video`, `ugc`, `product_ad`, `b_roll`, `demo`, `app_preview` or `interactive_3d`. A UGC asset retains the script, judge and believability checks regardless of provider. |
| `brief.purpose`, `brief.placement` | Communication problem and destination role. |
| `brief.kit` | `path: "DESIGN.md"`, `revision` matching its frontmatter `version`, a full SHA-256 of its bytes, and `assets: [{path, sha256}]` for the linked kit files used. An explicit empty array means no external kit assets are used. |
| `brief.lineage` | `{path, sha256, rights}` for every `inputs` entry. Use workspace-relative files. For an external fact, retain a permitted local source record containing the public URL and the supported claim; a URL is not locally verified media. |
| `brief.references` | `{path, sha256, rights, roles, permitted_influence, forbidden_transfers}`. Roles are `identity`, `scene`, `product`, `composition`, `motion`. Permitted influences are `color`, `typography`, `logo`, `voice`, `composition`, `lighting`, `camera`, `material`, `motion`, `product`. Only an identity role can influence color, typography, logo or voice. Claims have a separate source. |
| `brief.claims` | `{text, source, sha256}` for each product claim and its local evidence file. Use an explicit empty array if there are no claims. A matching digest binds the evidence, but does not establish the claim's truth. |
| `brief.allowed_variation`, `brief.forbidden_changes` | Explicit arrays defining the campaign's freedom and identity constraints. Empty allowed variation means no variation is authorized by this brief. |
| `brief.contains_text`, `brief.fonts` | Boolean plus resource IDs from `DESIGN.md` `foundation.typographyResources`. Text requires at least one owned resource. Local font files are checked against their recorded bytes. System and remote font declarations still require actual output/load inspection. |
| `technique` | Selected medium, reason, required capabilities, renderer declaration, meaningful fallback and proof obligations as described below. |

Kit, source, reference and claim files must remain inside the business workspace,
including after resolving symlinks. Changed bytes invalidate the brief even if
the kit's human-readable revision stayed the same. Reassess affected outputs
before updating their recorded inputs. Never update a digest just to preserve a
previous acceptance claim.

Use an explicit empty `references` or `claims` array when applicable. Do not
invent a reference, font, asset or claim to fill the schema. Keep original
source expression out of the workspace unless its use is permitted. A source
record, a manifest check and a provider execution receipt are different evidence.

## Technique Selection

Set `technique.kind` to `native`, `semantic_web`, `layered_2_5d`, `real_3d` or
`media`. State the product reason, `required_capabilities`, and
`renderer: {id, capabilities}` from the selected implementation. These are
compatibility declarations, not proof that the renderer ran. Record
`fallback: {mode, preserved_job, limitations}` and a non-empty
`proof_requirements` array before production.

| Technique | Select for | Proof and fallback |
| --- | --- | --- |
| Native or semantic web | Frequent actions, forms, settings, reading and comparison. | Actual platform/keyboard/reading order, user text settings and recovery. Preserve the task when decoration or motion is unavailable. |
| Layered 2.5D | A meaningful sequence explaining a process or transformation. | Forward/reverse timeline, jumps, responsive crops, text clearance and touch/keyboard. A static sequence must preserve the explanation. |
| Real 3D | Inspectable depth and spatial manipulation are part of the job. | Require `depth`, `camera`, `picking` capabilities and `interactive_3d` kind. Inspect alternate angles, controls, deformation/recovery when selected, export and measured environment behavior. A still cannot pass as the interaction. |
| Media | Campaign imagery or explanation requiring no live spatial simulation. | Inspect actual files, crop, identity, truth, playback and destination fit. Label conceptual or mock material. |

Layered 2.5D requires `compositing`. Other techniques include it only when they
combine layers. Record `alignment`, `camera`, `lighting`, `mobile_variant`,
`required_layers` IDs, and `layers: [{id, input, origin, anchor, depth, alpha}]`.
`input` names a lineage entry; origin and anchor are normalized `[x,y]` pairs
from zero to one; depth is finite; alpha declares required transparency. Every
required layer must exist. These declarations do not prove actual transparency,
camera alignment or correct layering; inspect the rendered output.

Use a bounded production loop: establish a useful checkpoint, repair the largest
defect, inspect the actual result and exercise relevant interactions. Retain the
best working checkpoint. Repeated non-progress calls for a changed approach.
Record iteration and spending ceilings through existing job authority. No
provider-name match, passed manifest or attractive still proves motion, frame
rate, truthful product behavior or independent visual acceptance.

## Project Shape

Do not add Remotion dependencies to this skill package. Create a launch-repo-local content workspace only when a project needs rendered content:

```text
content-assets/
  CONTENT_ASSETS.md
  content-assets.html
  manifest.json
  copy/
  inputs/
  remotion/
    README.md
    package.json
    remotion.config.ts
    src/
    public/
  out/
```

Use the Remotion starter only after the route is approved and license status is recorded:

```bash
mkdir -p content-assets
cd content-assets
npx create-video@latest --yes --blank --no-tailwind remotion
```

Use app-specific package scripts in `growth/content-assets/remotion/package.json`, for example:

```json
{
  "scripts": {
    "studio": "remotion studio",
    "compositions": "remotion compositions",
    "render": "remotion render",
    "still": "remotion still"
  }
}
```

Keep raw captures under `growth/content-assets/inputs/` or `screenshots/raw/`, generated outputs under `growth/content-assets/out/`, and final store upload assets under the store screenshot path only after QA.

## Remotion Skill Routing

When writing Remotion code, use the `remotion-best-practices` skill if available. Refresh current Remotion docs through Context7 or official docs before setup, CLI flags, renderer API examples, or license-sensitive guidance.

Relevant Remotion skill rules:

- `compositions.md` for `Composition`, `Still`, default props, and folders
- `assets.md`, `images.md`, and `videos.md` for source media and `staticFile()`
- `parameters.md` for Zod schemas and input props
- `timing.md`, `sequencing.md`, `transitions.md`, and `text-animations.md` for frame-based animation
- `measuring-text.md` for fitting long text, localized strings, and store-safe overlays
- `subtitles.md` for captions
- `audio.md`, `sfx.md`, `ffmpeg.md`, and `silence-detection.md` for audio and post-processing
- `calculate-metadata.md` for dynamic duration, dimensions, and props

Remotion animation must be frame-driven with `useCurrentFrame()`, `interpolate()`, `spring()`, `Sequence`, or related Remotion APIs. Do not rely on CSS transitions or CSS animations for render-critical motion.

Keep render lanes distinct but visually consistent: Remotion (video/still render) stays frame-driven, while live web surfaces (landing pages, funnels, web paywall) use framer-motion / the `motion` library. Both should draw timing/easing from the same `motion.*` tokens (`design/system/tokens.css` `--motion-*`) so a Remotion ad and the landing page it drives to feel like one brand. Do not import framer-motion into Remotion compositions or into the shipped mobile binary.

## Composition Standards

Create small, named compositions with explicit outputs:

- `VerticalHookDemo`: 1080x1920, 30fps, 6-20 seconds
- `SquareAdStill`: 1080x1080 still or short loop
- `StoreScreenshotFrame`: platform-specific dimensions with real app UI
- `AppPreviewClip`: App Store/Play preview dimensions and length constraints
- `CreatorBriefClip`: social-native product moment with captions and CTA

Each composition should have:

- stable composition ID
- explicit width, height, fps, and duration
- typed props and Zod schema when input varies
- default props that render without secrets or network access
- local assets in `public/` referenced with `staticFile()` or explicit remote URLs with license/source notes
- reduced-motion or still fallback where the asset appears in HTML proofs
- caption or silent-playback strategy for social clips

## Render Commands

Preview:

```bash
cd content-assets/remotion
npm run studio
```

List compositions:

```bash
cd content-assets/remotion
npx remotion compositions
```

Render a one-frame check:

```bash
cd content-assets/remotion
npx remotion still VerticalHookDemo --scale=0.25 --frame=30 --output ../out/vertical-hook-frame30.png
```

Render video:

```bash
cd content-assets/remotion
npx remotion render VerticalHookDemo --output ../out/vertical-hook-demo.mp4
```

Render still:

```bash
cd content-assets/remotion
npx remotion still SquareAdStill --output ../out/square-ad-still.png
```

If renders use audio, captions, trimming, or format conversion, record FFmpeg commands and outputs in `CONTENT_ASSETS.md`.

## Asset QA

Before marking a content asset done:

- real app UI is visible where the asset claims to show the app
- source screenshots/recordings, design tokens, copy, and legal/pricing claims are traceable
- selected-provider license status and any required fallback authority are recorded
- public claims match `APP_STORE_LISTING.md`, `revenue/REVENUE_OPS.md`, `trust/PRIVACY.md`, `trust/TERMS.md`, and onboarding/paywall copy
- no generated or mock UI is presented as real production functionality
- captions, silent playback, text fit, safe areas, and mobile readability are checked
- output dimensions, duration, codec/container, and target surface are recorded
- render command and output path are recorded
- HTML proof embeds or links representative output
- store uploads, public posting, scheduling, and paid campaigns remain founder-approved

For store screenshots and previews, app UI must be truthful and Apple/Google policy-aligned. Remotion can frame, caption, compose, resize, or animate real captures, but it cannot make unsupported product claims true.

## Artifacts

Create `CONTENT_ASSETS.md` when generated, composed, captured or licensed assets are in scope.

Include:

- route matrix: operation class, selected provider, permitted sources and blocked or deferred requirements
- license and fallback approvals
- source input inventory and rights notes
- composition manifest
- target surfaces and dimensions
- render commands and proof paths
- QA checklist and claim review
- output registry
- blocked assets and founder-only gates

Create `growth/content-assets/manifest.json` for machine-readable assets. New
packets use the version 2 contract above. Legacy packets retain these fields:

- `asset_id`
- `surface`
- `route`
- `status`
- `composition_id`
- `dimensions`
- `duration_seconds` when video
- `inputs`
- `outputs`
- `truth_constraints`
- `approvals`
- `render_proof`
- `license_status`

Create or update `content-assets.html` as the founder-facing proof board. It should show route decisions, asset thumbnails/placeholders, target surfaces, source inputs, output paths, QA status, and blocked approvals.

Record lane and selected-tool evidence through the existing workflow and reducer.
Do not edit `state/business-state.json` directly. For a selected Remotion job,
the existing evidence paths include:

- `lanes.content_assets.status`
- `lanes.content_assets.evidence`
- `tools.remotion.route`
- `tools.remotion.docsCheckedAt`
- `tools.remotion.license_status`
- `tools.remotion.preflight`
- `tools.remotion.validation`
- `tools.remotion.fallback`

## Common Failure Modes

- Treating Higgsfield unavailability as automatic permission to use Remotion.
- Calling Remotion a free fallback without checking license eligibility.
- Rendering polished mock UI and letting it drift into store screenshots or product claims.
- Creating videos without `DESIGN.md`, source screenshots, captions, text-fit checks, or claim review.
- Making one-off assets with no manifest, render command, or rerender path.
- Forgetting that public posting, scheduling, store uploads, paid campaigns, and creator spend require founder approval.
- Bundling a heavy Remotion project inside this skill instead of creating it in the launch repo that owns the media.
