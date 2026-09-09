# Paid Tool Routing And Free Fallbacks

Use this before using, skipping, or replacing any paid third-party tool or paid tier of a freemium tool in the launch workflow, and at the start of every workflow to collect the account-gated tools that start might need.

The rule is simple: tool access missing from the current runtime does not mean the founder lacks the tool, refuses to pay for it, or wants a weaker free fallback. Ask once at workflow start. Do not park a research-intelligence lane in silence.

## Contents

- Decision Protocol
- Workflow Intake
- Confirmation Prompt
- Tool Map
- Artifact Requirements
- Founder Gates
- Common Failure Modes

## Decision Protocol

1. At workflow start, derive the tool list from Workflow Intake below. Present one AskUserQuestion. Do not open a second tool gate in the same turn.
2. Identify each preferred tool/tier and why it is useful for the lane. If a free tier exists, separate what it covers from the paid capability the lane actually needs.
3. Check for the MCP path first. Before concluding a paid tool is unavailable, use `ToolSearch` to search for `mcp__<TOOLNAME>__*` tools in the current runtime. For each primary tool, the exact prefix to search is:
   - AppKittie: `mcp__appkittie__`
   - XPOZ: `mcp__claude_ai_XPOZ__`
   - Higgsfield: `mcp__claude_ai_Higgsfield__`
   - Refero: `refero_search` (MCP or skill-provided)
   - MobAI: `mcp__mobai__`
   - Retention Mechanics: `mcp__retention-mechanics__` (also plain `retention_` tool names)
     If the MCP tools are present and callable, use them. A tool that "did not show up as an available connector" is not the same as a tool absent from the runtime — verify via ToolSearch before concluding unavailable.
4. Check whether the user already supplied access, exports, screenshots, CSVs, PDFs, API keys, or prior results that satisfy the lane.
5. Tools named at intake do not get a second paid-tool confirmation. Credit or subscription spend still uses a separate spend gate with an amount.
6. If a tool that was not on the intake list becomes necessary mid-flight, use the Confirmation Prompt once for that tool.
7. Record the start-of-workflow route and each per-tool row in `strategy/TOOL_DECISIONS.md`.

Do not present a fallback artifact as equivalent to the paid-tool artifact. Label fallback outputs with confidence, limitations, and what the paid tool would have improved.

## Workflow Intake

Present one start-of-workflow question for the account-gated tools that workflow might need. Do not create a second tool registry. A catalog `provider` id is not required.

**Derive the list**

1. Choose the walk root. Complete-business or full-launch: `workflow.research.research-backed-spec` plus its compiled dependencies (portfolio observe and paid-tool routing are already on that graph). Focused start: that workflow plus its dependency closure.
2. For each node, scan compiled instructions, consults, reads, and bound knowledge documents for Tool Map names and MCP prefixes.
3. Always add App Store Connect CLI and `workflow.operations.live-app-store-portfolio` when the start is complete-business, full-launch, or the compiled graph includes `research-backed-spec` or `live-app-store-portfolio`. Focused starts omit tools whose names do not appear in that graph.
4. ASC and the live apps-list receipt stay required on any start that includes those nodes. Deferring optional research tools does not skip the portfolio hold.

**Ask once**

Use AskUserQuestion with `multiSelect` unset (false). The prompt body is the choice frame only and must stay at or under 240 characters. Put recommended-set names and jobs in the option descriptions, using Per-Tool Question Inputs.

```text
Phase: <phase>. Outcome: start this workflow with the accounts it needs. Choose the recommended set, name optionals, or defer optionals. App Store Connect and the live portfolio stay required.
```

Three mutually exclusive options:

1. **Recommended set** — connect every listed optional tool plus required ASC and the live portfolio.
2. **I'll pick next** — the founder names which optional tools to connect in that same turn. Unnamed optionals are recorded as labeled fallback in that same turn. Do not open a second tool gate.
3. **Defer optional** — ASC and the live portfolio remain required. Optional research-intelligence tools (AppKittie, XPOZ, Firecrawl, paid ASO) continue as labeled fallback. Optional spend-gated tools (Higgsfield, MobAI upgrades, and similar) mean no spend and no labeled-fallback generate path.

If a readiness `activeFounderGate` is already pending, fold this recommended tool set into that same AskUserQuestion. Do not add a second founder gate. If no gate is pending, this intake is the gate. Founder-zero still allows at most one `activeFounderGate`.

I'll pick next with no names still writes `strategy/TOOL_DECISIONS.md` (`Selected route: pick-next` plus fallback rows for the unnamed optionals) and can succeed paid-tool routing.

## Confirmation Prompt

Use this only for a tool that intake did not already decide. Use the Founder Question Contract, not a free-text access blocker. Name the phase/outcome and define the tool's job. If this is only a provider-route decision, offer these three shapes through AskUserQuestion when available:

```text
Phase: <plain-language phase>. Outcome: <what this unlocks>.
I use <paid tool> for <plain-language job>, but usable access is not available right now.

1. Use or provision <paid tool> (Recommended when its evidence is launch-critical) - the founder handles only the minimum access/spend gate; the agent continues the intended route.
2. Use an export or approved <fallback> - the agent continues now and labels the lower confidence and limitations.
3. Defer this optional tool - research-intelligence continues as labeled fallback; spend-gated defer means no spend. Do not park a research lane in silence.
```

If credits, a trial, subscription, or other spend is involved, separate that into a protected `spend` gate with an exact amount/ceiling and a defer choice; the fallback is a separate explicit route, never inferred authorization. If the founder says they have the tool, ask only for the minimum access/export needed. If the founder selects the free path, proceed and record the limitation.

## Tool Map

| Paid/account-gated tool or freemium paid tier | Preferred use                                                                                                                                                                                                                                                                                                           | Free or lower-cost route and confirmation boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AppKittie                                     | app-store economics, competitor intelligence, downloads/revenue estimates, keyword difficulty, reviews, ad/creator signals                                                                                                                                                                                              | public App Store/Google Play pages, store search, public reviews, app websites, manual competitor spreadsheet, Apple/Google console data if the app exists                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| XPOZ                                          | Reddit, TikTok, X/Twitter, Instagram social-language and creator research                                                                                                                                                                                                                                               | public web search, platform-native search in browser, Reddit search, YouTube comments, App Store/Play reviews, founder-provided screenshots/exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Firecrawl                                     | competitor site crawling, pricing/policy/funnel extraction, SEO/GEO page discovery                                                                                                                                                                                                                                      | browser inspection, web search, `curl`, `sitemap.xml`, `robots.txt`, Playwright/browser snapshots, manual page notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Higgsfield                                    | generated visuals, app icons, mascots, mockups, animations, ad creative, demo clips; also `brand-kits fetch`, `reframe` (aspect-ratio variants), and `personal_clipper` (long recording → short clips) — all three are paid/credit-consuming MCP operations and require the same spend confirmation as any generate run | Remotion code-rendered videos/stills after license check, real app screenshots, founder-owned assets, hand-authored HTML/CSS/SVG/canvas, local screen recordings, free/public-domain assets with license notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| MobAI                                         | Free tier: one device, limited daily AI usage, Testing Mode, and limited AI test generation/fixing. Plus/Pro: unlimited daily use; Pro adds unlimited devices, parallel suites, multi-device runs, and offline mode.                                                                                                    | Use the MobAI free tier without a spend gate when it satisfies the lane. Ask before upgrade/trial/spend. The in-app iOS Simulator (rung 0) is free, built in, and never needs a spend gate — but it is a _coverage_ decision, not a convenience: a one-off iOS look/flow/bug-repro check on a local Mac is the intended route and needs only a recorded rung in `strategy/TOOL_DECISIONS.md`, while using it in place of MobAI on a lane that needs Android, a repeatable `.mob` suite, CI, performance gates, multi-device runs, physical hardware, or polished demo recording drops coverage and requires the same recorded decision as the XcodeBuildMCP fallback. XcodeBuildMCP remains the scripted/CI Apple route; `xcodebuild`/`simctl` only if that route is approved and XcodeBuildMCP is unavailable. Use Android emulator/ADB or record a blocker for missing Android coverage. |
| Retention Mechanics MCP (first-party)         | live Experience Card deck: mechanic search with funnel-stage and ethics-risk-ceiling filters, versioned card content, tier-appropriate ethics attestation scaffolds; account-gated once launched, local during development                                                                                              | bundled frozen stubs in `knowledge/experience/experience-cards/` (routing, risk tiers, bright/dark lines, pinned motion canon) plus `knowledge/experience/ethics-guardrail.md` — the offline route with no spend gate; validators always read the bundled files, and without the server the deck contract and ethics contract still gate shipping, at stub depth                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Fastlane AI                                   | post-launch organic content engine, Blitz generation, scheduling, analytics                                                                                                                                                                                                                                             | manual content calendar, spreadsheet/JSON schedule, local prompts, platform-native drafts, no automated posting unless founder approves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Paid ASO/MMP/ad tools                         | keyword ranks, paid attribution, SKAdNetwork/ad-network reporting, competitor tracking                                                                                                                                                                                                                                  | AppKittie if available, public store search, store-console analytics, manual keyword sheet, Apple Search Ads/Google Ads native reports when accounts exist                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Sideshift or creator marketplace              | creator sourcing, payouts, view tracking for UGC                                                                                                                                                                                                                                                                        | manual TikTok sourcing, direct outreach, spreadsheet tracker, Stripe/Wise/Venmo payout records, creator-provided platform analytics screenshots                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| RevenueCat paid features                      | subscriptions, entitlements, experiments, web purchase links/funnels, webhooks                                                                                                                                                                                                                                          | free RevenueCat tier when sufficient; local/mock purchase tests only for implementation, never as proof of live entitlement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Stripe paid/account features                  | web checkout, billing, tax, portal, webhooks                                                                                                                                                                                                                                                                            | Stripe test mode when account exists; no real substitute for live payments and tax decisions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| PostHog paid features                         | product analytics, experiments, session replay, surveys, data pipelines                                                                                                                                                                                                                                                 | PostHog free tier if sufficient; static event catalog and local logging only as pre-implementation planning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Resend paid/account features                  | verified sender domain, transactional/lifecycle email, broadcasts, webhooks, inbound                                                                                                                                                                                                                                    | Resend free tier if sufficient; local email preview/logging for implementation only; Cloudflare Email Routing/Gmail for inbound support forwarding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Artifact Requirements

Create `strategy/TOOL_DECISIONS.md` when more than one paid or account-gated tool affects the launch.

The `## Workflow intake` section must record the start-of-workflow choice before paid-tool routing can succeed:

- `Selected route: recommended-set`, `pick-next`, `defer-optional`, or an explicit `no optional tools` row
- required tools that stay in force (ASC and the live portfolio when that graph applies)
- optional tools connected in this turn
- optional tools on labeled fallback, each with limitation text

Per-tool rows still include:

- tool
- lane
- ideal paid workflow
- access status
- founder confirmation
- selected route: paid, export, fallback, blocked, deferred
- fallback limitation
- license or rights status when a fallback uses Remotion, open-source media, public-domain assets, or founder-owned content
- downstream artifacts affected
- date checked

Research-intelligence defer (AppKittie, XPOZ, Firecrawl, paid ASO) records `selected route: fallback` with confidence, the limitation, and what the paid tool would have improved. The evidence lane continues. Spend-gated defer (Higgsfield, MobAI upgrades, and similar) records `selected route: deferred` and authorizes no generate path.

Small launches can add a "Tool decisions" section to `strategy/RESEARCH.md`, `engineering/ENGINEERING_PLAN.md`, `store/STORE_CONSOLE.md`, `SCREENSHOTS.md`, `growth/FASTLANE_OPS.md`, or `engineering/PRODUCTION_READINESS.md`.

## Founder Gates

Always ask before:

- signing up for a paid tool or starting a trial
- upgrading a plan
- using a paid API/credit budget
- creating paid cloud resources
- connecting social accounts
- changing billing, pricing, subscriptions, or live checkout
- publishing, submitting, scheduling, or posting
- entering credentials, API keys, or account sessions not already available

If the founder approves a fallback, do not keep re-asking for the same lane unless the fallback limitations change. Tools already named at workflow intake do not get a second confirmation. Keep at most one `activeFounderGate`.

## Per-Tool Question Inputs

Use this table to fill the three-choice Confirmation Prompt; do not send it as an open-ended question. Every fallback choice states its evidence limit, and every defer choice states its revisit point.

| Tool       | Plain-language job                                           | Access/export choice                             | Explicit fallback choice                                               | Evidence limit and revisit                                                     |
| ---------- | ------------------------------------------------------------ | ------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| AppKittie  | keyword difficulty and competitor download/revenue estimates | provision access or provide CSV/screenshots      | public store search plus a manual sheet                                | lower-confidence public estimates; revisit before final ASO positioning        |
| XPOZ       | language and creator research across social platforms        | provision access or provide an export            | platform-native browser search plus public web sources                 | smaller/non-equivalent sample; revisit before content strategy freezes         |
| Higgsfield | generated visuals, icons, mascots, ads, and demo clips       | provision access or provide existing assets      | founder-owned assets or approved Remotion output after a license check | no equivalent generative exploration; revisit before final creative production |
| Refero     | UX screen and flow references                                | provision Refero Pro or provide exported screens | bundled baseline pattern pack                                          | no live Refero corpus; revisit before the design direction freezes             |

Higgsfield credit use is a separate protected spend gate. Call `mcp__claude_ai_Higgsfield__balance`, show the current balance and estimated credits, then use AskUserQuestion: **full-quality exact batch** (recommended only when the evidence warrants the quoted spend), **cheap-first draft batch** with its lower credit estimate, or **defer generation** while non-spend preparation continues. No selection means no credits are used. `reframe` and `personal_clipper` are MCP-only and use the same spend gate; see `tool-recipes/visual-and-motion-production.md`.

## Common Failure Modes

- Treating a missing MCP tool as proof the founder does not own the service. **Always run ToolSearch for `mcp__<TOOLNAME>__*` before concluding a tool is unavailable.**
- Skipping the MCP-path detection step and jumping directly to a free fallback or curl-based scraping.
- XPOZ tools visible in `system-reminder` (e.g. `mcp__claude_ai_XPOZ__getRedditUser`) but agent claims "XPOZ not found" without calling ToolSearch to confirm.
- Higgsfield authenticated and MCP tools present, but agent does not invoke them because the work "only needed optimization" — use the tool or confirm with the founder that the lane is deferred.
- AppKittie `mcp__appkittie__batch_keyword_difficulty` available in the session but agent produces ASO keyword packets without calling it.
- Refero "not found" silently dropped — no strategy/TOOL_DECISIONS.md entry, no founder prompt, no fallback loaded.
- Running hours of manual free research when the founder would have provided an export or paid access.
- Replacing MobAI with XcodeBuildMCP or the in-app iOS Simulator without saying that Android coverage, repeatable suites, CI, performance gates, and physical-device automation are no longer covered.
- Installing MobAI or XcodeBuildMCP, or asking the founder for tool access, just to look at one screen or walk one flow on a local Mac — that is rung 0 work and needs no install and no gate.
- Calling local mocks "validated" for RevenueCat, Stripe, PostHog, or Resend when provider dashboards were never checked.
- Generating visual assets with free local methods or Remotion after Higgsfield was intended, without asking whether the founder wants to use Higgsfield or approve the fallback.
- Treating Remotion as universally free for commercial work without checking the current Remotion license and recording eligibility or founder approval.
- Creating a store-console or ASO packet from public pages alone when App Store Connect or Google Play Console access was available but not requested.
- Presenting fallback outputs without a confidence label, limitation note, and strategy/TOOL_DECISIONS.md entry — every fallback decision must be recorded even when small.
- Opening a second sequential tool gate after intake, or asking again for a tool the founder already named.
- Treating "defer optional" as parking a research-intelligence lane. AppKittie, XPOZ, Firecrawl, and paid ASO continue with labeled fallback.
- Treating Higgsfield or MobAI-upgrade defer as authorization to generate on a labeled-fallback path. Defer there means no spend.
