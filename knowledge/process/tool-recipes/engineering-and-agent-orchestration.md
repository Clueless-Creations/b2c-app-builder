# Engineering And Agent Orchestration

Use current tools and live data whenever possible. Treat this file as workflow, not fixed facts.

Part of the [Tool Recipes](../tool-recipes.md) index. Before using any paid or account-gated tool named below, honor the **Paid Tool Decision Protocol** and **Founder-Only Gates** in that index.

---

## Compound Engineering And Agent Orchestration

Purpose: turn the launch package into production-ready software without losing product, design, analytics, entitlement, or testing truth.

Use `engineering-orchestration.md` before:

- actual app, backend, or web-funnel implementation
- builder/Rork/Codex/Claude handoff prompts that will create app code
- `operations/ORCHESTRATION.md`, `AGENTS.md`, `CLAUDE.md`, `state/LAUNCH_TRACE.md`, `engineering/TECH_SPEC.md`, `engineering/ENGINEERING_PLAN.md`, or `engineering/PRODUCTION_READINESS.md`
- deciding whether to use product brainstorm, planning, parallel agents, or worktrees
- declaring beta, store-submission, or production readiness

Load `compound-engineering-routing.md` before core engineering. It is the enforceable CE route and state contract; this section is the quick recipe.

Use `parallel-agent-orchestration.md` before any subagent dispatch or multi-lane launch run. The default runtime habit should be: keep the critical path local, identify safe sidecar agents, serialize shared resources, and write the preflight before claiming speed from parallelism.

Delegate:

- `ce-update` in Claude Code, or a recorded local inventory/latest-release fallback, before a substantial engineering run.
- `ce-brainstorm` after AppKittie/XPOZ/Firecrawl research when product shape, onboarding, paywall, core loop, activation, or scope still has multiple defensible directions.
- `ce-plan` when launch docs are stable enough to become an implementation plan.
- `ce-work` for bounded execution from a concrete plan.
- `ce-worktree` for isolated parallel engineering lanes, PR review, or keeping a dirty main checkout safe.
- `ce-code-review` before treating non-trivial implementation as complete.
- `ce-test-browser` for web funnels, checkout, policy pages, support flows, dashboards, and responsive browser checks.
- `ce-test-xcode` for iOS build/test verification where applicable.
- `ce-proof` or `ce-demo-reel` when the founder/reviewer needs a visual proof artifact.
- MobAI MCP or the local `using-mobai-cli` skill for serialized mobile-device E2E and store screenshot capture.
- Use the Monitor tool to stream a long App Store Connect or Cloudflare deploy wait instead of polling manually. Monitor is unavailable on Bedrock, Vertex AI, and Foundry; poll every few minutes there instead.
- If Compound Engineering is unavailable, record the unavailable route and equivalent fallback in `operations/ORCHESTRATION.md`, `state/business-state.json`, and `engineering/ENGINEERING_PLAN.md`; do not let agents skip directly from docs to readiness.

Parallel rules:

- Parallelize research, static audits, independent docs, isolated frontend/backend units, fixtures, and test-writing only after mapping each unit to create/modify/test files.
- If two lanes touch the same file, migration state, simulator/device, git staging, release action, or final readiness decision, run them serially.
- The orchestrator owns staging, commits, merges, project-wide suites, MobAI device ownership, production-readiness judgment, and final ship/hold decisions.
- Instruct parallel subagents not to run project-wide suites, stage files, commit, merge, publish, submit, schedule content, or mutate shared credentials.
- After parallel work returns, compare modified files, resolve collisions, run focused tests, then run integration/E2E checks.

Record in `operations/ORCHESTRATION.md` and `state/business-state.json`:

- CE availability, latest-version check, skills considered, selected route, and fallback reason if unavailable
- selected strategy: `not_evaluated`, `inline`, `serial_subagents`, `parallel_subagents`, `worktrees`, `hybrid`, `blocked`, or `not_needed`
- critical path kept local by the orchestrator
- candidate units, roles, objectives, modes, files, shared resources, and safety decisions
- spawned agents, forbidden actions, output paths, actual file collision check, and integration status
- focused validators and full suites run after integration

Record in `engineering/ENGINEERING_PLAN.md`:

- product brainstorm source or skip rationale
- requirements trace to `state/LAUNCH_TRACE.md`, `engineering/TECH_SPEC.md`, `PRODUCT.md`, `DESIGN.md`, `analytics/ANALYTICS.md`, `product/ONBOARDING.md`, `revenue/REVENUE_OPS.md`, `growth/EMAIL_OPS.md`, `trust/PRIVACY.md`, `store/APPLE_SIGNING.md`, and `store/STORE_CONSOLE.md`
- implementation units, repo-relative paths, serial dependencies, worktree needs, safe parallel lanes, serialized resources, and subagent output contracts
- frontend, backend, database, analytics, revenue, email, privacy, store-console, app-integrity, permission, and state-machine impacts
- test scenarios, MobAI E2E scenarios, backend/provider verification, release gates, and blockers

Record in `engineering/PRODUCTION_READINESS.md`:

- build/typecheck/lint/test commands and outcomes for every touched repo
- browser/mobile E2E evidence, including MobAI steps and screenshots where relevant
- backend/database/provider proof for frontend actions, RevenueCat/Stripe entitlements, PostHog events, Resend sends/webhooks, and account deletion/support paths when in scope
- release-build/staging-build proof that mocks are disabled and secrets are not bundled
- remaining blockers and founder-only gates

Rules:

- `AGENTS.md` is mandatory for real app builds and builder handoffs; start from `surfaces/workspace-template/repo-agent-entrypoints/AGENTS.md` so future agents keep using `b2c` without another founder prompt. `CLAUDE.md` should start from `surfaces/workspace-template/repo-agent-entrypoints/CLAUDE.md` and point back to `AGENTS.md` instead of duplicating product truth. Keep these files as maps to source docs, active plans, validators, and failure cards.
- Unit tests are not enough for production readiness.
- Screenshot proof from any device route — in-app simulator, MobAI, XcodeBuildMCP — is not backend proof; pair device actions with database/provider/dashboard evidence.
- Do not use generated builders from a prompt alone. Include repo-local instructions and artifacts so later agents can continue without reconstructing the launch logic.

## Choosing MCP, CLI, Or Skill For A New Tool

Ask four questions before adding a third-party tool to a workflow lane:

- who is the end user
- which model drives the call
- does the session need call-level observability
- does the tool's schema change often

Route to a CLI recipe when a frontier model drives the tool locally against a stable, deterministic interface. Route to an MCP server when the tool needs OAuth or has no CLI equivalent. Route to an installed agent skill pack when the tool is craft or reference guidance, not a live API call.
