import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { getLane, readState, writeState } from "./_state.js";

export function writeCompleteContentAssets(root: string): void {
  mkdirSync(path.join(root, "content-assets"), { recursive: true });
  writeFileSync(
    path.join(root, "content-assets", "CONTENT_ASSETS.md"),
    [
      "# Content Assets",
      "Route Matrix",
      "Higgsfield is the intended paid visual route for net-new AI imagery. If Higgsfield is unavailable, stop for founder approval before Remotion fallback.",
      "Remotion is approved for local rendered product-demo assets from real app UI.",
      "Founder approval is required before public posting, store upload, paid generation, paid render infrastructure, or scheduling.",
      "License status: Remotion license eligibility for commercial use is checked or founder-approved before production output.",
      "Source Inputs: screenshots/raw/onboarding.png, 11_STAR_EXPERIENCE.md, DESIGN.md, content-assets/copy/hooks.json, owned or licensed media.",
      "Composition Manifest: content-assets/manifest.json records asset IDs, composition IDs, dimensions, inputs, outputs, truth constraints, approvals, render proof, and license status.",
      "Render Commands: cd content-assets/remotion && npx remotion render VerticalHookDemo --output ../out/vertical-hook-demo.mp4.",
      "Claim Review: real app UI remains visible, no unsupported pricing, endorsement, medical, financial, urgency, scarcity, or unavailable UI claims.",
      "Output Registry: vertical-hook-demo -> content-assets/out/vertical-hook-demo.mp4.",
      "Public Use Gates: founder approval required before posting, store upload, paid ads, or creator distribution.",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    path.join(root, "content-assets", "content-assets.html"),
    "<!doctype html><html><body>Content asset route and output proof board</body></html>",
    "utf8",
  );
  writeFileSync(
    path.join(root, "content-assets", "manifest.json"),
    JSON.stringify(
      {
        schema_version: "1",
        assets: [
          {
            asset_id: "vertical-hook-demo",
            surface: "tiktok_reels_shorts",
            route: "remotion",
            status: "draft",
            composition_id: "VerticalHookDemo",
            dimensions: "1080x1920",
            duration_seconds: 12,
            inputs: ["screenshots/raw/onboarding.png", "11_STAR_EXPERIENCE.md", "DESIGN.md", "growth/content-assets/copy/hooks.json"],
            outputs: ["growth/content-assets/out/vertical-hook-demo.mp4"],
            truth_constraints: ["real app UI remains visible", "V1 scalable slice from 11_STAR_EXPERIENCE.md remains truthful", "no unsupported claims"],
            approvals: ["founder approval before public posting", "fallback approval before replacing Higgsfield"],
            render_proof: "cd content-assets/remotion && npx remotion render VerticalHookDemo --output ../out/vertical-hook-demo.mp4",
            license_status: "Remotion license status checked before commercial use",
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
}

export function writeCompleteViralGrowth(root: string): void {
  mkdirSync(path.join(root, "growth"), { recursive: true });
  const state = readState(root);
  const growthLane = getLane(state, "growth");
  growthLane["status"] = "succeeded";
  growthLane["evidence"] = ["growth/VIRAL_GROWTH.md", "growth/format-lab.csv", "growth/UGC_PLAYBOOK.md", "growth/FASTLANE_OPS.md"];
  growthLane["blockers"] = [];
  writeState(root, state);
  writeFileSync(
    path.join(root, "growth", "VIRAL_GROWTH.md"),
    [
      "# Viral Growth",
      "Fit Gate: the app has a visible personal result, a shareable emotional moment, and no privacy or policy blocker.",
      "Growth Thesis: the 11_STAR_EXPERIENCE.md V1 slice becomes a truthful product loop, a creator-visible content loop, and a measurable conversion path.",
      "Product Loop: users can share or invite from the result preview after onboarding. Referral Or Share Mechanic: stable referral code, recipient value, backend entitlement validation, duplicate handling, self-referral prevention, rate limits, support recovery, and abuse controls.",
      "Content Loop: TikTok/Reels/Shorts formats show real app UI, product visibility, a clear CTA, creator_code mapping, and claim constraints.",
      "Format Lab: growth/format-lab.csv records format ID, hook, first frame, product insertion, CTA, variables, signal windows, and status.",
      "Monetization Timing: product/ONBOARDING.md previews value before paywall, revenue/REVENUE_OPS.md owns RevenueCat and Stripe package rules, paywall timing, purchase proof, restore purchases, and transparent terms.",
      "Measurement Plan: analytics/ANALYTICS.md and analytics/analytics-plan.html define PostHog events, dashboard proof, referral_invite_started, referral_invite_completed, referral_unlock_earned, share_started, share_completed, creator_code_applied, viral_format_signal_detected, paywall_viewed, purchase_completed, entitlement_active, and retention checks.",
      "Loop Economics: k = invites per active user times recipient conversion, computed weekly; k at 0.06 in week one with a 6-day cycle time, trend flat — the loop is not yet a growth engine and the share moment is the next test.",
      "Stop And Scale Rules: one viral post is not a format; scale after 2-3 repeatable hits plus downstream app opens, paywall reach, purchases, and retention evidence, keyed on k and its trend rather than gross share counts.",
      "Founder-Only Gates: creator payments, paid tools, public posting, social account connections, pricing changes, legal approval, and platform-policy approval.",
      "Traceability: state/LAUNCH_TRACE.md maps GROW-001 from research to PRODUCT.md, 11_STAR_EXPERIENCE.md, product/ONBOARDING.md, growth/UGC_PLAYBOOK.md, CONTENT_ASSETS.md, growth/FASTLANE_OPS.md, revenue/REVENUE_OPS.md, analytics/ANALYTICS.md, trust/PRIVACY.md, trust/TERMS.md, and engineering/PRODUCTION_READINESS.md.",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    path.join(root, "growth", "format-lab.csv"),
    "format_id,hook_structure,first_frame,product_insertion,cta,signal_window,status\nFMT-001,personal reveal,real app result,result preview,share referral code,24h/72h/7d,active\n",
    "utf8",
  );
  writeFileSync(
    path.join(root, "growth/UGC_PLAYBOOK.md"),
    "# UGC Playbook\n\nCreator scripts use GROW-001 and the format lab.\n\nPost-Breakout Scale Model: roster grows in bands (3-5 discovery, ~10 proven, ~30 scale, 75+ volume), each band a founder-gated budget step with install-per-video fatigue measured weekly. Current band: Discovery, entered 2026-07-01, budget $300/week founder-approved with the prior band's install-per-video and payback numbers in front of the decision.\n",
    "utf8",
  );
  writeFileSync(path.join(root, "growth/FASTLANE_OPS.md"), "# Fastlane Ops\n\nFastlane reuses approved format IDs after launch approval.\n", "utf8");
}

export function writeCompletePaidUserAcquisition(root: string): void {
  mkdirSync(path.join(root, "growth"), { recursive: true });
  const state = readState(root);
  const paidUaLane = getLane(state, "paid_user_acquisition");
  paidUaLane["status"] = "succeeded";
  paidUaLane["evidence"] = ["growth/PAID_UA.md", "growth/paid-ua-report.csv"];
  paidUaLane["blockers"] = [];
  writeState(root, state);
  writeFileSync(
    path.join(root, "growth", "PAID_UA.md"),
    [
      "# Paid User Acquisition",
      "Fit Gate: store destination, privacy, support, onboarding, paywall, RevenueCat entitlement, and founder-approved spend are ready for a limited test.",
      "Channel Choice: one-channel rule selects Meta Ads for the first test while TikTok, Google web-to-app, Apple Ads, and Apple Search Ads are rejected until one channel works.",
      "Creative Production: CONTENT_ASSETS.md owns 3-5 weekly creative assets, angle IDs, real app UI, product visibility, claim constraints, and the 11_STAR_EXPERIENCE.md V1 slice.",
      "Creative Scoring Gate: score each video creative with the Virality Predictor (brain_activity) before paid distribution; record virality_score and hook_dmn_risk per creative.",
      "Tracking Baseline: analytics/ANALYTICS.md records PostHog events, ad-network SDK or native report route, App Store Connect or Google Play store metrics, self-reported attribution, and baseline uplift rules.",
      "MMP Before Spend: complete the tracking baseline before the first paid dollar.",
      "AppsFlyer Default: AppsFlyer SDK plus RevenueCat $appsflyerId bridge before spend. Founder MMP waiver required for any other stack.",
      "RevenueCat Economics: revenue/REVENUE_OPS.md uses RevenueCat LTV, cohorts, trial starts, purchases, and entitlement data to compare CPA, CPI, ROAS, and payback window.",
      "Blended Report: growth/paid-ua-report.csv records spend, impressions, clicks, installs or app opens, paywall views, trials, purchases, entitlement active count, revenue, CPA, LTV window, winning angle, and next action.",
      "Weekly Schedule: Monday report review, Tuesday 3-5 asset production, Wednesday delivery check, Thursday anomaly check, Friday scale/hold/reduce/pause decision, and daily 15-minute pacing checks.",
      "Stop And Scale Rules: stop when baseline is missing, CPA cannot fit LTV, paywall or retention quality drops, or only clicks/installs improve; scale after one channel and repeatable creative angles show downstream revenue evidence.",
      "Decision Thresholds: Attribution tolerance ±20% across RevenueCat, store console, PostHog, and self-reported; Payback window 90 days against realized LTV; Creative signal floor 2x target CPA or 7 days per creative; Scale trigger 14 consecutive days at or under target CPA at approved spend.",
      "Draft Status And Kill Window:",
      "Campaigns stay as PAUSED drafts until founder approval of live delivery.",
      "48-hour kill window: review CPA, payback, and product drop-off after first spend.",
      "Founder-Only Gates: founder approval is required for ad account connection, budget, spend, automated rules, paid MMP/ad tooling, ad-network SDK privacy changes, custom product pages, public creative, pricing, trials, offers, and legal copy.",
      "Traceability: state/LAUNCH_TRACE.md maps PUA-001 from strategy/RESEARCH.md to CONTENT_ASSETS.md, revenue/REVENUE_OPS.md, analytics/ANALYTICS.md, APP_STORE_LISTING.md, trust/PRIVACY.md, trust/TERMS.md, and engineering/PRODUCTION_READINESS.md.",
      "",
      "## Non-Competitor Angle Hunt",
      "",
      "Same ICP, new motivation: after the primary profile saturates, expand motivations for the same customer. Do not only raise budget. Do not clone competitor assets or claims.",
      "",
      "| Angle ID | Source kind | Source note | Motivation | Competitor-wrong | Adopted |",
      "| --- | --- | --- | --- | --- | --- |",
      "| UA-ANG-001 | print | Architectural Digest layout trigger | cost-conscious care | original | yes |",
      "| UA-ANG-002 | cross-niche | travel packing ritual | weekly reset | original | no |",
      "| UA-ANG-003 | ad-library-adjacent | adjacent category US ads | identity | original | no |",
      "| UA-ANG-004 | second-profile | second motivation for the same customer | clean-freak | original | yes |",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    path.join(root, "growth", "paid-ua-report.csv"),
    "date,channel,campaign,spend,impressions,clicks,installs_or_opens,paywall_views,trials,purchases,entitlement_active,revenue,ltv_window,cpa,roas_or_payback,winning_angle,next_action\n2026-05-28,meta,launch_v1,100,10000,300,80,40,10,3,3,90,d7,10,watch,UA-001,hold\n",
    "utf8",
  );
}

export function writeCompleteOrchestration(root: string): void {
  mkdirSync(path.join(root, "orchestration"), { recursive: true });
  const state = readState(root);
  writeState(root, state);
  writeFileSync(
    path.join(root, "operations/ORCHESTRATION.md"),
    [
      "# Orchestration",
      "Orchestration Preflight: the orchestrator keeps state integration local while product and security audits run in parallel.",
      "Strategy: hybrid manager pattern with one orchestrator.",
      "## Session Continuity",
      "Last state review: 2026-05-31.",
      "Continuity source set: AGENTS.md, state/business-state.json, operations/ORCHESTRATION.md, operations/BUSINESS_ACCESS.md, operations/business-access.json, engineering/PRODUCTION_READINESS.md, operations/FAILURE_CARDS.md.",
      "Memory policy: Do not rely on chat memory or prior transcripts as source truth; repo state wins.",
      "Git status reviewed: yes.",
      "Drift risks or stale assumptions: none for this fixture.",
      "Next action: continue with integrated validation.",
      "State reconciliation needed: no.",
      "Compound Engineering Routing: ce-update freshness checked v3.9.3 against latest release v3.9.3; ce-brainstorm skipped because product direction already decisive; ce-plan created engineering/ENGINEERING_PLAN.md; ce-work executed bounded units; ce-worktree was not needed; ce-code-review passed; ce-test-browser covered web proof; ce-proof produced proof artifact.",
      "Candidate Units: product-audit includes PRODUCT.md, 11_STAR_EXPERIENCE.md, product/ONBOARDING.md, and state/LAUNCH_TRACE.md; security-audit is read-only; state-integration is serialized.",
      "Parallel Safety Check: file-overlap check passed; actual modified files were compared after agent outputs returned.",
      "File Ownership: the orchestrator owns state/business-state.json, engineering/PRODUCTION_READINESS.md, git, and releases.",
      "Serialized Work: provider/account mutations, credentials, device control, git, commits, pushes, public posting, and release decisions stay serialized.",
      "Subagent Instructions: do not stage files, do not commit, do not push, do not mutate providers, do not control devices, and do not make founder-only decisions.",
      "Integration Plan: the orchestrator reviews outputs, accepts or rejects findings, updates failure cards and state, then runs focused validators and the full suite.",
      "Verification: npm run check:orchestration -- --root . and npm run audit passed.",
      "Founder-Only Gates: pricing, legal, credentials, spending, public posting, app-store submission, and destructive repo actions.",
      "State Updates: state/business-state.json were reconciled after integration.",
      "Failure Cards: no active orchestration failure cards remain.",
      "## Review Ledger",
      "| Surface | Producer | Auditor | Rubric | Verdict | Findings artifact | Date |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| Security audit | orchestrator (inline) | security-architect (fresh) | workflow auditor contract | pass | orchestration/security-audit.md | 2026-05-31 |",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(path.join(root, "operations/orchestration.html"), "<!doctype html><html><body>Orchestration board</body></html>", "utf8");
  writeFileSync(path.join(root, "orchestration", "security-audit.md"), "# Security Audit\n\nNo orchestration blocker remains.\n", "utf8");
}

export function writeCompleteCompoundEngineering(root: string): void {
  writeCompleteOrchestration(root);
  const state = readState(root);
  const engineeringLane = getLane(state, "engineering");
  engineeringLane["status"] = "succeeded";
  engineeringLane["evidence"] = ["engineering/TECH_SPEC.md", "engineering/ENGINEERING_PLAN.md", "engineering/PRODUCTION_READINESS.md"];
  engineeringLane["blockers"] = [];
  writeState(root, state);
  writeFileSync(path.join(root, "engineering/TECH_SPEC.md"), "# Tech Spec\n\nImplementation contracts are traced from state/LAUNCH_TRACE.md.\n", "utf8");
  writeFileSync(
    path.join(root, "engineering/ENGINEERING_PLAN.md"),
    [
      "# Engineering Plan",
      "Compound Engineering: ce-plan produced this plan after product direction already decisive; ce-brainstorm was skipped with rationale.",
      "ce-work will execute bounded implementation units and ce-worktree is reserved for isolated parallel lanes.",
      "Review, test, and proof gates require ce-code-review, ce-test-browser or ce-test-xcode when applicable, MobAI for mobile E2E, and ce-proof before readiness.",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    path.join(root, "engineering/PRODUCTION_READINESS.md"),
    [
      "# Production Readiness",
      "Implementation proof: ce-work completed the planned units.",
      "Review proof: ce-code-review passed against requirements.",
      "Test route: ce-test-browser covered the web funnel and MobAI E2E proof covers mobile flows where relevant.",
      "Proof artifact: ce-proof produced the founder-visible inspection artifact.",
      "Remaining blockers and founder-only gates: none for this fixture.",
    ].join("\n"),
    "utf8",
  );
}

export function writeCompleteProviderProof(root: string): void {
  writeFileSync(
    path.join(root, "operations/PROVIDER_PROOF.md"),
    [
      "# Provider Proof",
      "Status: evidence captured for this fixture.",
      "Proof Ledger",
      "| Provider | current status | proof command | evidence path | founder-only gate |",
      "| --- | --- | --- | --- | --- |",
      "| PostHog | event and person property captured | inspect dashboard/API | analytics/posthog-proof.md | founder-only account access |",
      "| RevenueCat | sandbox purchase grants entitlement | sandbox purchase and entitlement check | revenue/revenuecat-proof.md | founder-only store product setup |",
      "| Resend | domain and test send captured | send test email | email/resend-proof.md | founder-only DNS access |",
      "| App Store Connect | app record and metadata inspected | asc validation commands | store/asc-proof.md | founder-only submission access |",
      "| Sentry | release event captured | trigger handled test event | security/sentry-proof.md | founder-only project access |",
      "| MobAI | target-user onboarding walkthrough captured | run mobile walkthrough | mobile/mobai-proof.md | founder-only device access |",
      "| Doppler | runtime injection captured | doppler run -- printenv APP_ENV | secrets/doppler-proof.md | founder-only secrets access |",
      "No raw secrets, private account screenshots, signing material, or credential screenshots are stored in proof artifacts.",
    ].join("\n"),
    "utf8",
  );
}

export function writeCompletePaidToolDecisions(root: string): void {
  writeFileSync(
    path.join(root, "strategy/TOOL_DECISIONS.md"),
    [
      "# Tool Decisions",
      "| Tool | Lane | Access status | Founder confirmation | Selected route | Fallback limitation |",
      "| --- | --- | --- | --- | --- | --- |",
      "| AppKittie | research/aso | access confirmed | founder approved paid use | AppKittie MCP | n/a |",
      "| XPOZ | research | access confirmed | founder approved paid use | XPOZ MCP | n/a |",
      "| Higgsfield | content_assets | access confirmed | founder approved; Remotion fallback approved if Higgsfield is unavailable | Higgsfield MCP | Remotion fallback is founder-approved |",
      "| Refero | design | access confirmed | founder approved | Refero MCP | bundled ux-patterns fallback approved |",
      "| MobAI | engineering | access confirmed | founder approved | MobAI MCP | XcodeBuildMCP fallback approved when MobAI is unavailable |",
      "| Codex Desktop native iOS / XcodeBuildMCP | engineering | available | founder approval not required for exposed local tools | session_show_defaults and build_run_sim | Apple-only proof; not provider or distribution readiness |",
      "| SnapshotPreviews | engineering | available | founder approved dependency | TEST_RUNNER_SNAPSHOTS_EXPORT_DIR | preview-only proof; not runtime E2E |",
      "| serve-sim | engineering | available | founder approved dependency | npx serve-sim | simulator stream; not provider or App Store signing proof |",
    ].join("\n"),
    "utf8",
  );
}

export function writeSourceRegistryFixture(root: string, includeUrl = true): void {
  mkdirSync(path.join(root, "checks", "validation", "repository"), { recursive: true });
  writeFileSync(path.join(root, "README.md"), ["# Source Fixture", "Use current docs from https://docs.doppler.com/docs/cli before setup."].join("\n"), "utf8");
  writeFileSync(
    path.join(root, "checks", "validation", "repository", "source-registry.yaml"),
    stringifyYaml({
      schema_version: 1,
      sources: includeUrl
        ? [
            {
              id: "example-source-current",
              name: "Example Source",
              source_type: "docs",
              url: "https://docs.doppler.com/docs/cli",
              refresh_cadence_days: 7,
              owner: "source-freshness",
              locations: ["README.md"],
            },
          ]
        : [],
    }),
    "utf8",
  );
}

export function writeCompletePriceDerivation(root: string): void {
  mkdirSync(path.join(root, "revenue"), { recursive: true });
  writeFileSync(
    path.join(root, "revenue/PRICE_DERIVATION.md"),
    [
      "# Price Derivation",
      "## Price Derivation Plan",
      "",
      "| Field | Record |",
      "| --- | --- |",
      "| Source subscription | com.app.monthly |",
      "| Target subscription | com.app.yearly |",
      "| Multiplier | 10 |",
      "| Storefront set | US, GB, JP |",
      "| Effective-date intent | next billing period |",
      "| Subscriber-preservation policy | preserve current subscriber prices |",
      "",
      "Confirm asc subscriptions pricing derive --help first.",
      "Run `asc subscriptions pricing derive --dry-run`. Dry-run causes no provider mutation.",
      "Do not infer approval from the multiplier. Founder approval is required before apply.",
      "Apple permits only one future change per storefront and billing plan type.",
      "Unavailable territories stay blockers. Do not fill a missing price point from a neighbor.",
      "After apply, readback every territory and reconcile RevenueCat, or write a recovery plan.",
    ].join("\n"),
    "utf8",
  );
}

export function writeCompleteAiProviderControls(root: string): void {
  mkdirSync(path.join(root, "trust"), { recursive: true });
  writeFileSync(
    path.join(root, "trust/AI_PROVIDER_CONTROLS.md"),
    [
      "# AI Provider Controls",
      "## Paid AI Control Record",
      "",
      "Server-side authentication and verified identity before the first paid call.",
      "Server-side entitlement for paid recurring behavior.",
      "Per-owner throttles and global daily and monthly ceilings.",
      "Atomic pre-call reservation. Conservative accounting for timeout, refusal, and invalid output.",
      "Request, context, output-token, and timeout limits.",
      "Kill switch is fail-closed and preserves free and manual behavior.",
      "One approved secret runtime. Provider credential stays on the backend.",
      "Logs exclude prompts, responses, secrets, session tokens, and identity proofs.",
      "Key rotation and suspected-exposure procedures.",
      "Application cap status and provider-account cap status are separate fields.",
      "Unknown provider-console state stays unknown.",
      "Production readback and rollback instructions are recorded before ready.",
    ].join("\n"),
    "utf8",
  );
}

export function writeCurrentExperimentProgram(root: string, cycleDate: string): void {
  mkdirSync(path.join(root, "revenue"), { recursive: true });
  writeFileSync(
    path.join(root, "revenue/PAYWALL_EXPERIMENT_PROGRAM.md"),
    [
      "# Paywall Experiment Program",
      "## Cycle Log",
      "",
      "| Cycle date | Backlog change | Next experiment |",
      "| --- | --- | --- |",
      `| ${cycleDate} | recorded current paywall experiment row | next priced offering test |`,
      "",
    ].join("\n"),
    "utf8",
  );
}
