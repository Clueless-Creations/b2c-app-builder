# Parallel Agent Orchestration

Use this before any broad launch run, multi-lane app build, skill audit, or production-readiness sweep where parallel agents, subagents, specialist role prompts, or worktrees could move faster without losing control.

This reference turns the agent's default question from "what do I do next?" into "what can safely run in parallel while I keep the critical path moving?"

## Source Basis To Refresh

Refresh current provider guidance before changing runtime-specific orchestration commands or claiming vendor recommendations:

- OpenAI agent guide: `https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/`
- OpenAI Codex app: `https://openai.com/index/introducing-the-codex-app/`
- OpenAI harness engineering: `https://openai.com/index/harness-engineering/`
- OpenAI Agents SDK update: `https://openai.com/index/the-next-evolution-of-the-agents-sdk/`
- Anthropic multi-agent research system: `https://www.anthropic.com/engineering/multi-agent-research-system`
- Anthropic Claude Code subagents: `https://code.claude.com/docs/en/sub-agents`
- Anthropic Claude Code dynamic workflows: `https://code.claude.com/docs/en/workflows`
- Anthropic containment model: `https://www.anthropic.com/engineering/how-we-contain-claude`
- Anthropic Claude Code advanced patterns: `https://www.anthropic.com/webinars/claude-code-advanced-patterns`

Current synthesis for this skill:

- Start with a strong single orchestrator. Split only when tool overload, context separation, independent breadth, or specialist consistency justifies the coordination cost.
- Prefer a manager pattern for B2C launches: one orchestrator owns the user thread, shared state, integration, git, provider mutations, public actions, device control, and release calls. Specialists never perform these actions.
- Use parallel subagents for breadth-first work and bounded independent units, not for shared-file editing, device/simulator control, account mutations, or final launch decisions.
- Treat subagents as tools with narrow objectives, explicit inputs, output contracts, forbidden actions, and blast-radius limits.
- Parallelism is not free. It can burn tokens, duplicate work, create merge conflicts, and make hidden assumptions harder to catch unless the orchestrator records the plan and reconciles outputs.
- Keep `AGENTS.md` as the short map over the harness: source docs, active plans, validations, and failure cards. Repeated orchestration misses should become mechanical checks or LaunchBench scenarios.
- A role earns a roster slot only when its read set, write scope, or risk differs from every other role. Do not add a role that only narrows an existing scope by a filter.

## Subagents Vs Dynamic Workflows

This reference covers Claude's turn-by-turn subagents and worktrees, where the orchestrator holds the plan in its context. When the runtime is Claude Code and a stage needs dozens-to-hundreds of agents, a codified repeatable quality pattern (adversarial verification, tournament, loop-until-done), or a run you want to read and rerun, use a **Dynamic Workflow** instead — the plan moves into a script the runtime executes in the background, and only the final answer returns to context. Workflows are the preferred shape for the heavy _pre-build_ stages on the Claude side of the Claude-vs-Codex split; subagents here are the fallback when workflows are unavailable, disabled, or below Claude Code v2.1.154. See [`dynamic-workflows.md`](./dynamic-workflows.md). Either way, the adversarial-verification and quarantine shapes still apply — only the runtime changes.

## Required Preflight

Before substantial launch work starts, write or update `operations/ORCHESTRATION.md` and the `orchestration` block in `state/business-state.json`. At the start of a new session, resume, status check, or handoff, also update the Session Continuity block from `AGENTS.md`, `state/business-state.json`, `operations/ORCHESTRATION.md`, `engineering/PRODUCTION_READINESS.md`, `operations/FAILURE_CARDS.md`, and `git status --short`; chat memory is not source truth.

The orchestrator must answer:

1. What is the immediate critical path I should do locally?
2. What independent sidecar work can run in parallel without blocking that path?
3. Which work needs specialist consistency rather than generalist attention?
4. Which files, repos, providers, devices, or accounts are shared resources?
5. Which tasks must be serialized because they mutate the same source of truth?
6. What proof will show subagent findings were reviewed, integrated, and validated?

If the answer is "no useful parallelism," record `strategy: inline` and a concrete `dispatch_reason`. If the runtime lacks a callable subagent facility, record `strategy: blocked` or `inline`, put the limitation in `dispatch_reason`, and run the specialist briefs serially or inline from `APP_AGENTS.md`. Do not set `manager_pattern: true` and leave both `spawned_agents` and `dispatch_reason` empty. The preflight must show whether delegation happened and why.

**MCP catalog overflow (a common silent subagent failure).** When many MCP servers are connected, the combined tool catalog can overflow a subagent's context before it starts — the subagent returns empty with ~0 tokens in a few seconds, or fails with "Prompt is too long." If a dispatched subagent exits in under ~5 seconds with no output, treat it as a context-overflow signal, not a task result. Mitigation: prefer `strategy: inline` for MCP-tool-heavy research and run it in the parent session. If background dispatch is required, confirm Tool Search lazy-loading is active first. Tool Search auto-enables once MCP tool schemas pass roughly 10% of context. This is `auto:10` by default, since Claude Code v2.1.7 — it is not off by default. Lower the threshold with `auto:N`, or force it on with `=true`. Either change typically needs a client restart. Reported measurements show a roughly 85% cut in tool-schema tokens. Before dispatch, count active MCP servers and total exposed tools. Flag a session above roughly 10 servers or 80 tools, and confirm Tool Search is active before a background dispatch. Do not wait until a subagent returns empty to check it. Record the overflow and the chosen mitigation in `operations/ORCHESTRATION.md`; do not silently retry the same dispatch.

## Strategy Choices

Use the smallest strategy that fits the work:

- `inline`: one orchestrator does the work. Use for small edits, urgent critical path, or tightly coupled tasks.
- `serial_subagents`: specialists run one at a time for context isolation or independent review, but each result feeds the next step.
- `parallel_subagents`: independent agents run at the same time with disjoint write scopes or read-only audit scopes.
- `worktrees`: implementation lanes run in isolated git worktrees when parallel edits would otherwise collide.
- `hybrid`: parallel read-only audits plus serialized implementation, or worktrees for code and one serialized device/provider owner.
- `blocked`: orchestration would help, but access, repo state, or missing source truth prevents safe dispatch.
- `not_needed`: the app has no real build, audit, or multi-lane launch work in scope.
- `not_evaluated`: no orchestration preflight has happened yet; do not treat this as approval to run broad work inline.

Default for broad B2C launch work is `hybrid`: the orchestrator continues the critical path locally while read-only or isolated specialists inspect independent lanes. Do not silently run broad multi-lane work fully inline when a subagent-capable runtime is available.

Estimate the combined token count before choosing between one unified reviewer and independent parallel per-file agents. Below roughly 100,000 tokens, keep one agent that reads every file, so it can catch cross-file contradictions. Above that, fan out and record the blind spot in `operations/ORCHESTRATION.md`. For a pure count, list, or pattern-match question, write one `grep`, `find`, or `jq` command instead. Reserve subagent dispatch for judgment or synthesis work.

## Good Parallel Units

Parallel agents are useful when each unit has a clear output and does not need another unit's unfinished result:

- market/review research, social-language research, web/SEO research, and competitor pricing scans
- ASO metadata audit, app privacy/data inventory, analytics event catalog, and onboarding critique
- design-system audit, accessibility review, content-asset route review, and screenshot matrix review
- RevenueCat/Stripe entitlement review, Resend lifecycle review, PostHog attribution review, and security threat-model review
- frontend implementation in one repo and backend implementation in a different repo
- test fixture creation, static validator authoring, and documentation updates when file ownership is disjoint
- LaunchBench prompt review against known failure modes

Name each research agent's excluded scope, not only its own scope. This cuts overlap between the four research lanes before agents start.

## Design-Lock Fan-Out

Run this fan-out when `DESIGN.md` is accepted. Do not wait for the app build to finish.

The graph makes these units ready from the same design dependency:

| Unit                             | Workflow or prompt                                                       | Write scope                |
| -------------------------------- | ------------------------------------------------------------------------ | -------------------------- |
| App implementation               | `workflow.engineering.engineering-orchestration-ce-production-readiness` | assigned app source paths  |
| Local landing build              | `workflow.growth.pre-launch-funnel-landing-waitlist`                     | `growth/landing/`          |
| Store position and keywords      | `workflow.store.aso-and-store-ops`                                       | `STORE_OPS.md`             |
| Screenshot and product-page plan | `agents/launch-surface-producer.md`                                      | exact store planning paths |
| Marketing assets                 | `workflow.design.content-assets-remotion-generated-visuals`              | content asset paths        |
| Copy and price check             | `agents/launch-surface-producer.md`                                      | exact copy paths           |

Use `initial-build` mode for the landing unit. A public deployment is a different workflow and remains founder-approved.

Do not skip landing work because final app captures do not exist. Build screenshot slots and the capture plan now. Add real captures when app flows are stable.

## Continuous Surface Sync

Run this loop for each accepted app slice:

1. Dispatch `agents/launch-surface-producer.md` in `impact-audit` mode before the slice merges.
2. Classify the change with [`change-cascade.md`](../process/change-cascade.md).
3. Assign each affected path set to a separate bounded-update unit.
4. Continue the next app slice while those update units run.
5. Serialize shared store documents, provider changes, device capture, and public actions.
6. Integrate the updates. Run focused checks and `check:change-cascade`.

The audit checks landing onboarding, copy, prices, screenshots, marketing assets, Apple product pages, Google Play listings, and localizations.

## Work To Serialize

Do not parallelize these unless they are isolated in separate worktrees and the orchestrator owns final integration:

- edits to `state/business-state.json`, `AGENTS.md`, `engineering/ENGINEERING_PLAN.md`, `engineering/PRODUCTION_READINESS.md`, or release notes
- migrations plus code depending on the migration state
- MobAI, in-app iOS Simulator panes, XcodeBuildMCP, serve-sim, or simulator/device automation on the same target device — and note that an in-app simulator device belongs to the session that launched it (max 4 panes per session), so a subagent cannot inherit the orchestrator's simulator; the orchestrator runs the device flow itself
- App Store Connect, Google Play, RevenueCat, Stripe, Resend, PostHog, DNS, domain, Fastlane, or social-account mutations
- git staging, committing, merging, rebasing, tagging, pushing, release submission, or public posting
- final production-readiness, pricing, legal, security acceptance, or launch decisions

## Parallel Safety Check

Before dispatching parallel agents:

1. List every candidate unit.
2. For each unit, record `agent_type`, objective, expected output, input docs, create/modify/test paths, shared resources, and verification command.
3. Build a file-to-unit map from declared paths.
4. Mark any overlapping file, directory, provider, device, or account as serialized.
5. Confirm every parallel code-edit unit has a disjoint write set or a separate worktree.
6. Confirm every parallel audit unit is read-only unless assigned an isolated patch.
7. Add the exact forbidden actions to each prompt.
8. Record the preflight in `operations/ORCHESTRATION.md` and `state/business-state.json`.
9. Launch a broad multi-lane session with a dollar-budget cap where the runtime supports one, so a runaway fan-out halts automatically.

After agents return:

1. Compare actual modified files across agents.
2. Confirm each returned finding names the commit or branch state it was checked against. Recheck a finding tied to a commit that is no longer the current HEAD — the tree may have moved past it before you integrate.
3. Re-run any colliding units serially on the integrated tree.
4. Review each output against its requested format and source docs.
5. Apply or reject findings deliberately.
6. Run focused validators first, then full launch validators.
7. Update `state/business-state.json`, failure cards, and `engineering/PRODUCTION_READINESS.md`.

## Model And Effort Per Role

Assign each specialist role, and the orchestrator, a model and effort tier matched to its reasoning load, not its importance.

| Tier   | Roles                                                                                                                                    |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| High   | Security and release reviewer, backend and infrastructure engineer, orchestrator                                                         |
| Middle | Mobile engineer, product and UX designer, research strategist, accessibility and device QA specialist, copy specialist, customer success |
| Low    | A bounded mechanical audit, such as the launch-surface producer in `impact-audit` mode                                                   |

Record the assigned model and effort in each `spawned_agents` entry.

## Predetermined Specialist Prompts

Use the prompts in `agents/` through `APP_AGENTS.md`. Broad launch work has nine standard specialist reviews:

1. Research strategist: market, customer, competitor, review, social-language, and source-quality evidence. Dispatch when a market, competitor, or research claim changes.
2. Product and UX designer: core loop, scope, onboarding, activation, retention, and interaction behavior. Dispatch when the core loop, onboarding, or scope changes.
3. Visual designer: visual direction, hierarchy, composition, tokens, component expression, imagery, and motion. Dispatch when a screen ships or an existing screen changes visually.
4. Copy specialist: brand voice, product copy, conversion copy, comprehension, and claim discipline. Dispatch when user-facing copy changes.
5. Marketing and growth strategist: positioning, store conversion, acquisition, lifecycle, and measurable channel tests. Dispatch when positioning, a channel, or store copy changes.
6. Mobile engineer: native app architecture, implementation, performance, platform behavior, and mobile tests. Dispatch when native app code changes.
7. Backend and infrastructure engineer: data, API, auth, jobs, observability, deployment, and provider integration. Dispatch when a schema, migration, API, or provider integration changes.
8. Accessibility and device QA specialist: assistive technology, localization stress, device coverage, and real-flow evidence. Dispatch when a screen ships or a device-specific bug is reported.
9. Security and release reviewer: threat model, privacy/security controls, signing, store requirements, and release evidence. Dispatch when auth, payments, PII, or a new API surface changes.

A dispatch trigger keeps Continuous Surface Sync cheap on a small slice: a copy-only change dispatches the copy specialist alone, not all nine.

The launch-surface producer is a prepared execution prompt. Use it after design acceptance and after each accepted app change.
The operator-readiness prompt is a registered graph role. Founder-zero bootstrap routes to it before
the graph fans out. It resolves tools, access, budgets, and standing envelopes so later workers do
not create repeated founder gates. Provider mutations remain serialized and reconcile through the
orchestrator.

Never send a role prompt by itself. Dispatch the assembled node brief: parent repo contracts,
task-local artifacts, mandatory catalog knowledge, conditional role context packs, matching nested
skills, current tool-discovery routes, outputs, verification, and the machine-checkable knowledge
receipt. A missing receipt is a failed attempt.

Select only roles that match ready work. Dispatch independent read-only reviews together. Dispatch edits together only when their allowed paths do not overlap. Give each specialist only the minimum source set in its prompt. Do not pass the full conversation or every launch document by default.

## Standard Subagent Instructions

**Shared preflight facts.** Compute shared facts once per preflight: git status, catalog version, and current lane statuses. Paste that block into every parallel prompt. Do not let each subagent re-derive the same facts on its own.

Every parallel subagent prompt should include:

```text
You are not alone in this repo. Do not revert or overwrite work by other agents.
Your assigned objective: <objective>.
Read first: <specific docs/files>.
Allowed write scope: <paths> or read-only.
Allowed MCP tools: <names> or none.
Forbidden actions: do not stage files, commit, push, merge, run project-wide suites, mutate providers, change credentials, post publicly, submit builds, or make founder-only decisions.
If you lack context: request up to two more cycles; name the exact file or symbol you need and why it matters; produce your best output after the third cycle and flag any remaining assumption.
Return only this handoff:
- Scope reviewed
- Evidence
- Findings
- Recommendations
- Files changed
- Validation
- Risks and blockers
- Proposed state patch
- Knowledge receipt
```

For read-only audits, set `Allowed write scope: none`.

For code-edit workers, include disjoint paths and tell them to list changed files in the final answer. The orchestrator stages, commits, runs full suites, and pushes.

Use the retrieval clause only when a subagent traces call graphs, makes architectural decisions, or writes tests against existing code. Skip it when the task touches one or two known files.

A subagent inherits the parent session's permission mode by default. The Forbidden actions prose above is not enforcement by itself. Give a read-only or verifier role only status and verify tools, never operate, run, or bootstrap tools. Record the allowed set in the `Allowed MCP tools` line. Where the runtime supports it, narrow `tools`, `disallowedTools`, and `permissionMode` to match. Pair a read-only role with a `disallowedTools` list that removes `Write`, `Edit`, and `Bash`.

### Mid-Run Supervision

Do not interrupt a subagent that shows visible progress. Watch it through a per-agent status file, not a chat channel. Interrupt only on a visible drift signal. Four signals count:

- a script edited but never run for roughly 12 minutes
- a loop that kills and restarts itself
- the same directory rediscovered repeatedly
- a literal unsubstituted shell variable, such as `$now`

Cap a subagent at a fixed attempt count, such as eight, on one failing step. Require a two-line reflection before each retry: what exactly failed, and what one change would fix it. Kill and reassign a subagent stuck on the same blocker for three or more attempts. Also kill and reassign one that spends most of its token budget with no committed output.

## B2C Launch Dispatch Map

Use this dispatch map when a launch request is broad and the repo/runtime permits subagents.

| Lane                        | Parallel role                          | Output                                                                            |
| --------------------------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| Research                    | research strategist                    | evidence quality, customer language, category and competitor findings             |
| Product and UX              | product and UX designer                | scope, core-loop, onboarding, activation, retention, and interaction findings     |
| Visual design               | visual designer                        | hierarchy, composition, tokens, imagery, motion, and cross-surface findings       |
| Copy                        | copy specialist                        | voice, clarity, conversion, product-string, and claim findings                    |
| Marketing and growth        | marketing and growth strategist        | positioning, ASO/GEO, acquisition, lifecycle, and channel-test findings           |
| Mobile engineering          | mobile engineer                        | mobile architecture, implementation, performance, platform, and test findings     |
| Backend and infrastructure  | backend and infrastructure engineer    | API, data, auth, jobs, deployment, observability, and provider findings           |
| Accessibility and device QA | accessibility and device QA specialist | assistive-technology, device, localization, and end-to-end proof gaps             |
| Security and release        | security and release reviewer          | threat model, hardening, signing, store, supply-chain, and incident-response gaps |
| Customer success            | customer success                       | support, privacy/delete/refund/restore, lifecycle, review-response gaps           |
| Orchestrator                | main agent                             | state, integration, file collision check, git/release, final proof                |

A dispatch of more than about five agents at once raises documented coordination overhead. Split a full-roster dispatch into two or three waves of five or fewer. Reconcile each wave into `state/business-state.json` before the next wave starts. Claude Code enforces its own default concurrency and per-session spawn caps. Verify the current documented values before you rely on them.

Specialists review and propose by default. They implement only with an explicit assignment, a disjoint file scope, and an integration plan.

## State Contract

Business state records continuity using `lastStateReview`, `sourceFiles`,
`gitStatusReviewed`, and `nextAction` under `continuity`. Use the reducer to
update these fields. Keep the detailed preflight and dispatch plan in
`operations/ORCHESTRATION.md`: strategy, rationale, integration owner, file
ownership, candidate units, serialized resources, output review, and checks.
The orchestration lane links that evidence; it does not copy the full plan.
Serialize state updates, Git integration, provider mutations, and device control.

`candidate_units` entries should use:

```yaml
- id: "analytics-audit"
  role: "analytics specialist"
  objective: "Audit attribution contract and event proof."
  mode: "read_only"
  files:
    - "analytics/ANALYTICS.md"
    - "state/business-state.json"
  parallel_safe: true
  shared_resources: []
  output: "findings"
  status: "pending"
```

`spawned_agents` entries should use:

```yaml
- id: "agent-or-runtime-id"
  role: "security architect"
  objective: "Audit security release hardening."
  mode: "read_only"
  allowed_files: []
  forbidden_actions:
    - "stage"
    - "commit"
    - "provider mutation"
  status: "completed"
  output_path: "orchestration/security-audit.md"
```

When `manager_pattern` is `true`, record at least one `spawned_agents` entry after dispatch. If no specialist is dispatched, record a concrete `dispatch_reason`. A general strategy rationale is not a dispatch reason.

## Required Artifacts

`operations/ORCHESTRATION.md` must include:

- Orchestration Preflight
- Strategy
- Candidate Units
- Parallel Safety Check
- File Ownership
- Serialized Work
- Subagent Instructions
- Integration Plan
- Verification
- Founder-Only Gates
- State Updates
- Failure Cards

`operations/orchestration.html` is optional but recommended when the founder needs a visual board of lanes, blockers, assigned agents, and proof.

## Done Rules

Parallel orchestration is done only when:

- the selected strategy is recorded with rationale
- no parallel unit has undeclared overlapping files or shared mutable resources
- subagent prompts include forbidden actions and output shape
- actual returned file changes were compared before integration
- subagent findings are accepted, rejected, or converted into failure cards
- focused validators and the full relevant suite are recorded
- `state/business-state.json`, `operations/ORCHESTRATION.md`, and `engineering/PRODUCTION_READINESS.md` agree on current state

If any of these are missing, keep the orchestration state `partial` or `blocked`. Do not call the app launch-ready from parallel activity alone.

**Dispatch quality.** After specialists return, count three numbers. Count findings two or more agents flagged, findings only one agent found, and findings later judged invalid. Record the three counts next to the `spawned_agents` entries in `operations/ORCHESTRATION.md`. Zero unique findings across agents signals overlapping scope, not thoroughness.
