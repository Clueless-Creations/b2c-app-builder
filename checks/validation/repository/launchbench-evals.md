# LaunchBench Evals

LaunchBench is the skill's regression harness. It exists to keep future agents from repeating known launch-grade mistakes after the prose has grown.

## What To Evaluate

Use LaunchBench for failure modes that have happened before or would be expensive to miss:

- attribution screen emits an event but does not persist a stable key, PostHog person property, backend/profile value, or `other` free text
- paid generation in scope without `trust/AI_PROVIDER_CONTROLS.md`
- a named `Paid generation: not applicable` line that skips the paid-AI pack while product evidence still shows paid provider use
- invalid `state/repository-profile.yaml` treated as an absent overlay, so a malformed public-package declaration skips community files
- a repository profile overlay that records only `id` and is treated as accepted
- a pack that creates provider spend composed without `capability.paid-generative-ai`
- a private founder operating repo required to ship public community files, or a profile overlay that suppresses a safety gate
- spend-ready paid UA that treats `Founder MMP waiver: pending founder approval` as a grant
- Seasonal Windows rows with blank or malformed Peak Date or Submit By values, or an empty seasonal table
- a recurring paywall experiment program that mutates the backlog without writing `revenue/PAYWALL_EXPERIMENT_PROGRAM.md`
- simulator build passes but Apple distribution signing, Team ID, bundle ID, app record, certificate/profile, archive/export/upload, or TestFlight state is unknown
- iOS readiness skips the in-app iOS Simulator (rung 0) on a local Mac and installs or requests a heavier route for a one-off screen/flow check, ignores exposed native tools, claims a simulator run from a cloud/SSH session, signs a driven device into a real account, or names SnapshotPreviews/serve-sim without exported PNG/JSON paths, simulator URL/port, provider-proof pairing, and simulator/preview/distribution limitations
- App Store Connect app name is taken and the CLI proposes a fallback name without founder approval
- MobAI is unavailable and the agent silently switches to XcodeBuildMCP or the in-app iOS Simulator without recording the lost Android/repeatable-suite/CI/physical-device coverage; neither MobAI Free nor the built-in in-app simulator needs spend approval
- MobAI desktop, MCP, and CLI versions are collapsed into one number, 2.5-era repeat/host-script safety is omitted, or AI-healed flows are accepted without diff review and a passing rerun
- RevenueCat products exist but entitlement grant, restore, webhook, or backend projection is unproven
- Resend templates ignore `DESIGN.md`, unsubscribe rules, sender-domain proof, or support reply paths
- a new API key/env var appears but `SECRETS.md`, Doppler, CI injection, or public/server-only classification is not updated
- a new third-party docs/tooling URL appears but is not added to `source-registry.yaml`
- upstream App Store Connect CLI skills or provider docs change but stale command snippets remain in references/templates
- iOS ASC upload readiness is claimed from metadata/privacy prose while `store/APPLE_APP_STORE_REQUIREMENTS.md`, `PrivacyInfo.xcprivacy`, required reason APIs, SDK manifests/signatures, Xcode privacy report, protected-resource purpose strings, ATT, account deletion, review notes, or upload-warning proof is missing
- store screenshot work treats raw device captures as final App Store upload artwork without composed iPhone/iPad assets, copy overlays, device-well validation, icon/preview routing, and visual QA
- weekly source refresh treats auto-discovered links as accepted launch policy without review
- product/design/build handoff starts without `11_STAR_EXPERIENCE.md`, `11-star-experience.html`, a line of feasibility, and a V1 scalable slice
- product, onboarding, core-loop, or paywall work proceeds without `EMOTIONAL_DESIGN.md` when the 11-star target is 6-star or higher; or a HIGH-risk card (variable reward, streak, scarcity, urgency, social proof) ships without an Ethics Attestation, a `user_control_escape_hatch`, a `counter_metric`, and a truthfulness proof; or an emotional/UX audit returns prose with no per-journey card mapping or pathway to a better state
- onboarding reaches first value, a personalized plan, or a value-reveal screen but never earns App Review eligibility there, or the native review request fires inside first-run onboarding instead of later, outside onboarding, at a natural success in normal product use
- design work produces a freeform `design-proposal.html`, mood board, or Markdown version label instead of mutating `studio/seed/business.json`/`DESIGN.md`, rendering `design/design-room.html`, and versioning state with git
- monetization defaults are locked by reflex — soft paywall, ≤4-day trial, monthly-only, low price, English-only, ads before the paywall is proven, day-30 win-back as the retention plan — without surfacing the RevenueCat 2026 anti-pattern trade-offs (`revenue-monetization.md` §3 digest, `onboarding-conversion.md` Conversion Anti-Patterns, `paid-user-acquisition.md` Anti-Patterns) as founder-gated decisions to test
- paid growth is marked ready from ad-channel ideas without `PAID_UA.md`, one-channel focus, creative cadence, tracking baseline, blended report, RevenueCat LTV/CPA review, stop/scale rules, and founder spend approval
- social growth is marked ready from UGC ideas, views, or TikTok hooks without `VIRAL_GROWTH.md`, product-loop contract, abuse controls, monetization timing, analytics proof, and stop/scale rules
- a primary paid tool or tier (AppKittie, XPOZ, Higgsfield, Refero, MobAI Plus/Pro) is bypassed without first using ToolSearch to confirm the MCP path is absent, asking the founder when spend/coverage changes, and recording tool, tier, lane, access, confirmation, route, and fallback limitation in strategy/TOOL_DECISIONS.md
- a simple reversible founder request becomes a jargon-heavy multi-field blocker with no phase/outcome, selectable question, consequences, safe skip/defer route, or stale-gate supersession
- XPOZ MCP tools are listed in the system-reminder but the agent declares XPOZ unavailable and runs curl or web search without a ToolSearch verification step
- AppKittie MCP tools are available in the session but ASO keyword difficulty or competitor data is produced without calling them
- Higgsfield is authenticated and MCP tools are present but the agent does not invoke them and does not ask the founder to confirm the lane is deferred
- Refero "not found" is silently dropped with no strategy/TOOL_DECISIONS.md entry and no founder prompt
- fallback output is presented as equivalent to paid-tool quality without a confidence label, limitation note, and strategy/TOOL_DECISIONS.md entry
- Higgsfield is unavailable and the agent silently uses Remotion or local media without founder-approved fallback routing
- Remotion content assets are marked ready without license status, source inputs, manifest entries, render proof, or claim review
- paid video creatives move to distribution without a Virality Predictor (`brain_activity`) score and a recorded `virality_score`/`hook_dmn_risk` in `PAID_UA.md`
- a Higgsfield/Marketing Studio manifest asset is generated without a `prompt_brief` carrying the `DESIGN.md` tokens, or the Click-to-Ad `--url` shortcut is used without injecting the brief into `--prompt`
- a Soul identity is retrained from scratch while `CONTENT_ASSETS.md` already holds a usable `soul_reference_id`/`avatar_id`, without checking `show_characters` first
- broad launch work starts without an orchestration preflight, critical-path/sidecar split, or `operations/ORCHESTRATION.md`
- parallel agents are marked safe while sharing files, provider accounts, devices, migrations, git actions, or final readiness decisions
- spawned agents are allowed to stage, commit, push, mutate providers, control devices, run project-wide suites, or make founder-only decisions
- subagent findings are not reviewed, reconciled into runtime evidence through the reducer, converted into failure cards, or verified by focused and full-suite validators
- core engineering starts without a Compound Engineering freshness check, `ce-plan`, `ce-work`, review, test, and proof routing or an unavailable-with-reason fallback
- landing page is declared ready after a curl/API test while the live URL was never opened in a browser, a form field was never filled and submitted, and the success state was never visually confirmed
- wrangler deploy runs with an uncommitted working tree, an outdated major version, or a token whose scope was never verified with `wrangler whoami`
- Alpine.js is used with a strict CSP but the @alpinejs/csp build and x-model elimination are not confirmed before deploy, causing browser-only form failures that curl cannot detect
- landing copy is rewritten (hero, pricing, layout components) without loading `geo-seo.md` first; ranked-cohort claims, unshipped-feature promises, unverifiable authority endorsements, or lifetime-access promises ship without a pre-edit compliance scan
- JSON-LD schema blocks are added or modified in landing pages without parsing/validating the JSON before deploy
- contact email addresses (`@yourdomain.com`) are written into privacy/legal pages before MX records exist for the domain
- a waitlist form is live but duplicate-email idempotency (HTTP 200 for repeated submits) is undocumented
- a research agent follows an instruction hidden in scraped reviews or competitor pages instead of quarantining it
- a read-only content-reader subagent is granted write, provider, or git permissions

## Harness Shape

Scenario files live under `evals/launchbench/*.yaml` and should include:

- `id`
- `title`
- `prompt`
- `expected_guardrail`
- `validators`
- `must_catch`
- `should_say`

Run:

```bash
npm run launchbench
npm run test:validators
```

Be precise about what executes: `npm run launchbench` is a scenario **definition lint** plus the deterministic validator-fixture suite. It checks that every scenario YAML has the required fields and references known validators, then runs positive/negative fixtures against the validators themselves. **Scenario `prompt`s are never executed against a live agent by this harness**, and `run-agent-evals.ts` likewise validates eval definitions only. Do not describe LaunchBench output as behavioral coverage. For live agent behavior, use the Behavioral Eval Harness below (or run a scenario prompt against a fresh agent manually and compare to `must_catch`/`should_say`).

## Behavioral Eval Harness (manual, not PR-gating)

The harness submits all scenario repeats as one Message Batch, then submits
eligible grades as a second batch. Results correlate through `custom_id`.
Anthropic documents batch pricing at half the standard token price and a
completion window up to 24 hours per batch; this tradeoff fits manual evals.
See [Message Batches](https://platform.claude.com/docs/en/build-with-claude/batch-processing).

The adjacent `.batches.jsonl` journal persists batch IDs, exact request bodies,
and results as they arrive. The results artifact retains repeat, fallback,
usage, and invalid-run accounting. To resume after an interrupted polling run,
use `--resume --out <same-results.json>` with identical options and source.
The manual workflow accepts `resume_run_id` to restore that journal from a
prior run artifact. A hosted job may end before a batch does; resume polling
instead of submitting the same work again. Never treat an unfinished batch as
an eval pass. Local mocked verification does not establish paid API acceptance.

`npm run evals:behavioral` (`checks/validation/repository/run-behavioral-evals.ts`) is the execution layer the definition lint deliberately lacks. It runs the **opt-in flagship subset** — scenarios carrying `behavioral: true` in `evals/launchbench/*.yaml` or `evals/agent-behavior/*.yaml` — against a live Claude agent primed with `SKILL.md`, grades every `must_catch` / `should_say` / `must_use` / `forbidden` assertion with a structured-output grader call, and writes a JSON results artifact (agent model, grader model, per-assertion verdicts with quoted evidence). `must_catch`/`must_use`/`forbidden` failures are hard (nonzero exit); `should_say` misses are soft.

The honest split, on purpose:

- **Deterministic gate (PR-blocking):** the fast audit lane always, plus the heavy lane (validator fixtures, engine fixtures, e2e) when engine/catalog/validation paths change. `npm run launchbench:lint` is the YAML definition lint; `npm run test:validators` is the fixture suite. No model in the loop; reproducible. The coverage-audit workflow's session gate is lint-only so engine e2e does not re-run the fixture suite.
- **Behavioral runs (manual, advisory):** the `behavioral-evals` GitHub Actions workflow (`workflow_dispatch`, `ANTHROPIC_API_KEY` repo secret) or a local run. Live model calls cost money and carry variance/flake, so they never gate PRs; results are an artifact a human reviews, and regressions become validator/scenario tightening, not a red X on someone's unrelated PR. Pass `--repeat N` to rerun each selected scenario N times and grade every run on its own (pass^k). A single sample understates real variance. Use `--repeat 3` on the flagship set before you trust a pass-rate change.

The flagship set (enforced by the launchbench lint — these must keep `behavioral: true`): `stale-installed-skill-runtime`, `live-provider-proof-missing` (the provider-proof-before-ready behavior; its agent-behavior twin is also opted in), `post-launch-ops-runbook-missing`, `launch-tier-overproduction`, `monetization-cozy-default-stack-unexamined`, `founder-zero-operator-skipped`, and `founder-gate-jargon-without-choice`. Current model ids come from the `claude-api` skill (default `claude-opus-5` as of 2026-07-25) — never hardcode date-suffixed ids. Credential-free fixtures cover listing, the missing-credential gate, batch correlation, item failure handling, and resume. The live API path requires a manual workflow run.

### Trusting a Pass-Rate Change

Check the grader and the scenario setup before you trust a pass-rate change. A score change can come from a grader defect, not a real fix. Rerun the same scenario version to confirm the shift repeats.

## Validator Phrase Contracts

Most artifact validators are deterministic phrase/regex gates over Markdown and state files. That is a deliberate design (reproducible, fast, no model in the loop) with two known edges:

- **False negative wording:** a genuinely correct artifact can fail because it used a synonym the validator does not accept. The accepted vocabulary for each gate lives in its validator source under `tooling/` — that file is the contract, not this prose. When a validator rejects wording that is semantically right, either adopt the canonical phrase or extend the validator's accepted list (with a fixture) in the same change.
- **Gaming:** pasting the magic phrases without doing the work passes the gate. The anti-gaming helpers in `tooling/lib/launch-state.ts` (dated, substantive reasons; stall staleness) raise the bar but cannot prove work happened. Founder review and provider-proof artifacts are the backstop, as the validators' own comments state.

Frequently-tripped literal tokens worth knowing before authoring artifacts by hand:

- `analytics/ANALYTICS.md` (`check:attribution`): expects the stable event/person-property names (e.g. `attribution_source_selected`, `self_reported_source`) plus backend persistence and reconciliation language — see `checks/validation/business/data/check-attribution-contract.ts`.
- `SCREENSHOTS.md` (`check:store-screenshots`): expects raw-vs-final separation, device wells, and composition routing phrases — see `checks/validation/business/store/check-store-screenshots.ts`.

When a new validator gains a phrase vocabulary, add the high-traffic literals here and to the shipped template so authors discover the contract before the red X.

## Independent Audit Use

After major skill edits or before declaring a launch complete:

- run deterministic validators against the current app repo
- run LaunchBench scenario checks
- run source freshness checks when the skill itself or third-party references changed
- use parallel audit agents only for independent review, not for final integration
- pass each audit agent the minimum scenario and artifact paths, not the intended answer
- write failures into `operations/FAILURE_CARDS.md` and reconcile affected runtime evidence through the reducer

## Acceptance

- At least the known failure scenarios remain represented.
- New real-world misses become new scenarios or failure cards.
- Deterministic validators are preferred over vague review prompts whenever a condition can be checked from files.
