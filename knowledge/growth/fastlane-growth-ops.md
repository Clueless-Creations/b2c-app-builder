# Fastlane Growth Operations

Use this after the app is launched, approved, in public beta, or otherwise ready for organic social marketing through Fastlane AI at `usefastlane.ai`.

The goal is to turn the launch package into a repeatable short-form content engine without posting unapproved claims, leaking keys, overposting from cold accounts, or losing the link between content performance and product metrics.

Use [`paid-tool-routing.md`](../operations/paid-tool-routing.md) before replacing Fastlane AI, MobAI Plus/Pro or intended cross-platform coverage, Higgsfield, XPOZ, AppKittie, or creator-marketplace tooling with a free/manual fallback. MobAI Free needs no spend gate when its device/quota limits fit. Use `viral-growth-loops.md` before Fastlane content depends on referral/share mechanics, creator codes, social-comment loops, or viral paywall timing. Use `ugc-creator-engine.md` before building creator-led organic growth, creator briefs, scripts, or Day 0 format-discovery loops.

Load `founder-zero-operator.md` and reconcile `operations/BUSINESS_ACCESS.md` before social connections. If accounts do not exist, the agent guides creation and security one step at a time; if they exist, prefer delegated roles/OAuth and verify exact handles, recovery/2FA ownership, and publishing/spend boundaries before Fastlane connection.

## Contents

- Current Sources To Refresh
- Required Outputs
- UGC Input Layer
- Fastlane Setup Checklist
- Common Failure Modes

## Current Sources To Refresh

Refresh these before doing live setup because Fastlane UI/API behavior, limits, and supported destinations can change:

- App home: `https://app.usefastlane.ai/home`
- In-app guide: `https://app.usefastlane.ai/guide`
- Developer/API docs: `https://developers.usefastlane.ai/`
- Installed Fastlane skill: `usefastlane-ai`
- User-provided Fastlane skill file, when present. Compare it with the installed `usefastlane-ai` skill and prefer the newer or more complete guidance.

Notes:

- `developers.usefastlane.ai` and the in-app guide may render as a JavaScript app or require auth. If the page shell is empty, use the installed `usefastlane-ai` skill and safe live API reads as source truth rather than inventing fields.
- Do not scrape private workspace data unless the user authorized access and provided a key/session.
- API keys are scoped to the active workspace when created. Never write `FASTLANE_API_KEY` to committed files.

## Required Outputs

Create these when Fastlane setup or campaign work is in scope:

- `strategy/TOOL_DECISIONS.md` or a Fastlane tool-decision section: paid tool access, approved fallbacks, and blocked accounts.
- `growth/FASTLANE_OPS.md`: setup state, workspace, connected accounts, API status, content strategy, approval gates, and monitoring loop.
- `fastlane/campaign-brief.md`: product, ICP, pains, hooks, proof, offers, claims to avoid, platforms, and conversion goal.
- `fastlane/prompts.md`: reusable prompts for angles, Blitz generation, QA, captions, scheduling, and analytics.
- `fastlane/angles.json`: planned or live Fastlane angle objects.
- `fastlane/preferences.json`: planned or live Blitz preferences, including format weights and angle weights.
- `fastlane/schedule.json`: proposed posting schedule with platform, timezone, UTC time, content ID, caption, and approval status.
- `fastlane/api-log.jsonl`: sanitized log of API calls. Store method, endpoint, status, counts, and non-sensitive IDs only when needed.
- `fastlane/metrics-snapshot.json`: latest post/content analytics snapshot.
- `fastlane/runs/<timestamp>/`: per-run generated content IDs, downloads, QA notes, and schedule results.
- `growth/UGC_PLAYBOOK.md` and `ugc/` artifacts when creator-led UGC is part of the growth plan rather than only Fastlane-generated content.

Small launches can summarize these in `growth/FASTLANE_OPS.md`, but keep generated tooling/logs under `fastlane/` when live API automation is used.

## UGC Input Layer

Fastlane should amplify a real launch narrative and, when available, a UGC format engine.

Before generating content:

- load `ugc-creator-engine.md` when creator-led TikTok/Reels/Shorts is in scope
- load `viral-growth-loops.md` when generated content is meant to drive product referrals, share unlocks, creator-code attribution, app-store search, or paywall conversion
- confirm whether the current task is Day 0 format discovery, scaling a proven UGC format, or Fastlane-only organic scheduling
- use UGC fit, creator scripts, hook results, post metrics, and audience comments as source material
- keep creator disclosure, ad usage rights, and account ownership constraints visible
- map every UGC/Fastlane link to UTMs, creator/referral code where applicable, and self-reported attribution choices

Do not treat one viral UGC video as a reusable Fastlane angle. Promote a structure only after the same format shows repeatable signal or after the founder explicitly chooses an exploratory campaign.

## Fastlane Setup Checklist

### 1. Launch Readiness Gate

Do not start public Fastlane posting until these are true or explicitly marked blocked/deferred:

- public App Store/Play Store URL or TestFlight/beta URL exists
- landing page exists when web funnel is part of acquisition
- `11_STAR_EXPERIENCE.md`, `strategy/BRAND.md`, `DESIGN.md`, `LAUNCH.md`, and `product/ONBOARDING.md` are current enough to constrain content
- privacy/terms/support links are live if content drives signups, purchases, or data collection
- product claims, screenshots, pricing, and subscription disclosures match store/legal/revenue docs
- UGC creator rights, disclosure rules, and account ownership are documented when creator content is reused or remixed
- founder approves public posting, account connections, and any spend

### 2. Workspace And Product Profile

Click path:

- `https://app.usefastlane.ai/home` > sign in > select or create workspace

Capture in `growth/FASTLANE_OPS.md`:

- workspace name and owner, without exposing private IDs unless needed
- business/product website
- App Store and Google Play URLs
- landing/funnel URLs and UTM convention
- product category, ICP, promise, offer, and key proof points
- banned claims and compliance notes
- brand voice notes from `strategy/BRAND.md`
- 11-star complete product experience and line of feasibility from `11_STAR_EXPERIENCE.md`
- visual constraints and asset sources from `DESIGN.md` and `design/design-room.html`

If the Fastlane guide/onboarding asks for product context, fill it from canonical launch docs instead of ad hoc copy.

### 3. Social Account Connections

Click path:

- Fastlane app > Settings or relevant connection screen > connect social accounts

Use current UI/API to confirm supported destinations. Common short-form targets include TikTok, Instagram Reels, and YouTube Shorts; other destinations should be treated as current-workspace capabilities only after `GET /connections` confirms them.

Record:

- platform
- account handle
- connection status
- posting mode, for example direct post or inbox/manual approval when supported
- warmup status
- owner
- posting limits or workspace caps from current Fastlane docs/API/UI
- last verified timestamp

Founder gates:

- connecting accounts
- using personal/founder accounts
- first public post
- scheduling posts
- changing profile bios, links, or branding

### 4. API Access

Use the installed `usefastlane-ai` skill for endpoint details and live discovery.

Setup:

1. Open `https://developers.usefastlane.ai/` or the in-app developer/API settings route.
2. Create an API key for the active workspace.
3. Store it only in the shell/session or secret manager as `FASTLANE_API_KEY`.
4. Use host `api.usefastlane.ai` with base path `/api/v1` unless current docs say otherwise.
5. Run safe reads before mutations:
   - `GET /blitz/preferences`
   - `GET /blitz/angles`
   - `GET /connections`
   - `GET /content?limit=5`
   - `GET /posts?limit=5`

Record:

- key location, not the key value
- active workspace
- available platforms
- connected accounts count
- active angles
- current preferences
- content/post status counts
- rate-limit findings

Never use write endpoints as schema probes. Live API reads are the authority when the local skill and docs disagree.

### 5. Campaign Brief

Build `fastlane/campaign-brief.md` from:

- `PRODUCT.md`: accepted problem, wedge, ICP, moat, and accepted product behavior
- `strategy/BRAND.md`: voice, banned words, owned words
- `DESIGN.md`/`design/design-room.html`: visual tone and asset constraints
- `LAUNCH.md`: ASO keywords, launch calendar, screenshot claims, ad angles
- `product/ONBOARDING.md`: aha moment, personalization, paywall timing, review prompt
- `revenue/REVENUE_OPS.md`: offer, pricing, trial, subscription restrictions
- `trust/PRIVACY.md`/`trust/TERMS.md`: claims and disclosure boundaries
- `strategy/RESEARCH.md`: XPOZ/AppKittie/review language and creator formats
- `growth/UGC_PLAYBOOK.md` and `ugc/script-bank.md`: creator-tested hooks, format IDs, stop/scale rules, and rights constraints when available

Include:

- one campaign objective, for example installs, waitlist, trials, or reactivation
- 3-8 content pillars
- platform-specific hook patterns
- approved proof points
- claims to avoid
- CTA map with UTM parameters
- first 30-day testing cadence

### 6. Angles And Preferences

Create or update angles only after the campaign brief is locked.

Default angle set:

- educational pain solver
- demo/use-case
- founder/building in public
- comparison/alternative
- trend or meme adaptation
- proof/result story when evidence exists
- objection handler
- search/ASO keyword angle

Preference rules:

- format weights must sum to 100 when sent
- angle weights must cover every active angle exactly once and sum to 100
- changing format weights, remix percentage, or angle weights can flush or change the generation queue
- keep product mentions soft at first unless the campaign is explicitly product-led
- restore previous preferences after focused generation unless the user wants the workspace left tuned

### 7. Media Inputs From The App

Use real app media before generic generated visuals. Route capture through the Route Ladder in `xcodebuildmcp-testing.md` first:

- in-app iOS Simulator screenshots, recordings, and logs (rung 0, either runtime) first when the session is on a local Mac and the lane is a one-off Apple capture
- XcodeBuildMCP captures for scripted/CI or physical-device Apple work
- MobAI full-quality screenshots and screen recordings when the lane needs Android coverage or a repeatable capture cadence; record the coverage decision when an Apple-only rung replaces an intended MobAI route
- MobAI `mobile-recorder-skill` for polished iOS/Android app-flow videos with `.mob` choreography, tap ripples, finger overlay, phone bezel/background, zoom, variable speed, captions, final mp4, and upload copy
- MobAI `desktop-recorder-skill` for polished macOS/web app-flow videos with `screenplay.json`, click ripples, cursor sprite, captions, zoom, variable speed, final mp4, and upload copy
- serve-sim browser-visible simulator streams for CLI proof, with URL/port, actions, logs, and limitations recorded
- SnapshotPreviews PNG/JSON preview exports for component/preview evidence only; do not treat them as runtime app-demo footage
- app preview clips and store screenshots from `SCREENSHOTS.md`
- Higgsfield assets for supporting characters, backgrounds, hooks, and motion when constrained by `DESIGN.md`
- founder/UGC clips only when the founder approves identity use

MobAI capture rules:

- load `mobai-toolbelt.md` before recorder-skill or device recording work
- use latest MobAI docs and CLI help before capture
- refresh the MobAI GitHub org and selected recorder repo before install or command syntax
- prefer `npx @mobai-app/cli@latest` or a verified global install
- use `mobai observe --include ui_tree` before interaction
- use `mobai screenshot --full --path <dir> --name <name>` for production PNG screenshots
- use `mobai record` for product-demo clips when supported by the current CLI
- record device, OS, build, locale, theme, fixture, capture path, and proof constraints
- record `growth/DEMO_VIDEO.md` with choreography/screenplay, raw capture, final export, captions, upload copy, and rerender path when using recorder skills

Native iOS fallback/proof:

- load `xcodebuildmcp-testing.md` before Codex Desktop native iOS/XcodeBuildMCP, SnapshotPreviews, or serve-sim proof
- a plain Apple-only capture starts at rung 0 with no confirmation; when a lane needs a MobAI delta (Android, repeatable cadence, recorder polish) and MobAI is unavailable, confirm the XcodeBuildMCP replacement through `paid-tool-routing.md`
- record Apple-only coverage limits, preview-only limits, provider-proof pairing, and signing/distribution limits in `growth/FASTLANE_OPS.md`, `SCREENSHOTS.md`, and `engineering/PRODUCTION_READINESS.md`

### Multi-Format Delivery

Once a master video exists (real app footage from MobAI, Codex Desktop native iOS/XcodeBuildMCP, serve-sim, or a Higgsfield-generated supporting creative), convert it to all required aspect ratios at near-zero incremental cost versus three separate generations. See the **Master → All Platforms** recipe in `tool-recipes/visual-and-motion-production.md` for the full workflow.

Key points for this surface:

- `mcp__claude_ai_Higgsfield__reframe` is MCP-only — there is no `higgsfield reframe ...` CLI command. Confirm exact invocation via the `higgsfield-generate` skill or MCP tool help before running.
- `mcp__claude_ai_Higgsfield__personal_clipper_create` / `_jobs` / `_status` extracts shorts from long recordings before reframing. Same MCP-only constraint applies.
- Targets: 9:16 (TikTok / Reels), 1:1 (feed), 16:9 (YouTube / LinkedIn).
- **App Preview guardrail:** any reframe intended as an App Preview must be sourced from REAL app footage (an in-app iOS Simulator recording, MobAI, XcodeBuildMCP, or serve-sim capture) captured at a resolution that meets the target well. Generated video and preview-only snapshots are never valid App Preview sources.
- **Spend-confirmation gate:** reframe and personal_clipper consume paid credits. Confirm spend with the founder per `paid-tool-routing.md` and surface the current balance (`mcp__claude_ai_Higgsfield__balance`) before running.
- **CONTENT_ASSETS.md traceability:** record all output URLs, source job IDs (`source_job_id`), and aspect-ratio variants in `CONTENT_ASSETS.md` / `growth/content-assets/manifest.json`. Run `brain_activity` virality scoring on each variant and log the score before scheduling any paid distribution.
- Do not schedule reframed variants until the founder approves each output.

### 8. Generate, QA, And Schedule

Workflow:

1. Inspect workspace with safe API reads.
2. Snapshot current angles and preferences.
3. Create or update campaign angles if approved.
4. Patch preferences only when the tradeoff is intentional.
5. Generate Blitz content for the requested quantity.
6. Poll until content is `CREATED` or `FAILED`.
7. Download/render media into `fastlane/runs/<timestamp>/`.
8. QA each item for claim safety, brand fit, platform-native feel, readability, copyright risk, visual truthfulness, CTA, and app-store/legal consistency.
9. Prepare `fastlane/schedule.json`.
10. Schedule only after explicit approval.

Scheduling requirements:

- convert local times to UTC ISO timestamps
- include `connectionId` when multiple active connections exist for a platform
- respect current posting limits and account warmup
- prefer "post to inbox" or manual approval for first posts on cold accounts when available
- verify scheduled posts through `GET /posts`

### 9. Account Warmup And Cadence

Default warmup:

- first 3-5 days: complete profile, set link/bio, watch niche content, engage manually, do not post aggressively
- first posting week: one post/day per account while continuing engagement
- second posting week: up to two posts/day if early signals are healthy
- after warmup: 1-3 posts/day per account/platform when quality and engagement support it

Use more warmed accounts instead of overposting from one cold account. Treat platform caps as hard limits, but treat audience fatigue and account trust as stricter practical limits.

### 10. Analytics And Iteration

Weekly loop:

- fetch posts and analytics
- group by platform, format, angle, hook pattern, CTA, and posting time
- compare against app metrics: installs, store page conversion, trials, purchases, attribution answers, and PostHog events
- identify winning hooks, weak formats, failing CTAs, and content that drives low-quality traffic
- update angles, preferences, `fastlane/prompts.md`, and next schedule

Record in `growth/FASTLANE_OPS.md`:

- winner/loser summary
- next 7-day plan
- changes made to angles/preferences
- posts scheduled or canceled
- founder approvals still needed

## Common Failure Modes

- Starting Fastlane before the app has real links, legal pages, and truthful screenshots.
- Silently using a manual/free fallback when Fastlane, MobAI, Higgsfield, or creator tooling was unavailable.
- Scaling UGC/Fastlane content from one viral video instead of repeatable format evidence.
- Connecting accounts but never verifying `GET /connections`.
- Storing `FASTLANE_API_KEY` in repo files.
- Generating content from generic marketing claims instead of `PRODUCT.md`, `strategy/BRAND.md`, `LAUNCH.md`, and real user language.
- Scheduling posts before QA or founder approval.
- Using MobAI screenshots as low-quality JPEGs instead of full PNGs for production assets.
- Reusing creator clips without documented disclosure, rights, or founder approval.
- Forgetting to restore Blitz preferences after a focused campaign.
- Judging the channel after a few posts instead of a 30-day test.
- Tracking social metrics but not mapping them back to installs, trials, or revenue.
- Generating three separate Higgsfield videos for 9:16 / 1:1 / 16:9 instead of using reframe on one master.
- Using generated video as the source for an App Preview reframe instead of real app footage.
- Running reframe or personal_clipper without confirming spend with the founder and recording outputs in CONTENT_ASSETS.md.
