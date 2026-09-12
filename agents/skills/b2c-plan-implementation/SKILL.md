---
name: b2c-plan-implementation
description: "Produce a bounded implementation plan with ownership, interfaces, dependencies, tests, review, and risks. Planning does not execute app work or declare release readiness."
compatibility: Markdown and supplied evidence. Provider-backed work needs the corresponding authorized tools. The B2C runtime is optional for focused advisory work.
metadata:
  source-workflow: "workflow.engineering.engineering-orchestration-ce-production-readiness"
  generated-by: b2c-catalog
---

# Plan implementation

<!-- Generated task skill. Edit catalog owners, then run render:task-skills. -->

## Choose the scope

Use this task directly for focused advice, review, or an authorized change. Do not require setup, install software, create a workspace, or activate a full launch graph merely to use this expertise. A review is read-only unless the user also requests changes.

For an existing managed business, read business-status then business-plan and use its current brief. This skill cannot choose executable next work, bypass prerequisites, change provider bindings, or replace runtime acceptance. Do not inspect raw reducer files merely to start a focused task.

## Method

For a review, assess the existing evidence against this method and return findings; do not execute its authoring or mutation instructions. For requested creation or implementation, follow the method only within the accepted scope and authority.

## Continuous experience principle

Carry the accepted user's intended outcome through the work: make the result meaningfully better for that user, preserve relevant identity, hierarchy, accessibility, and recovery constraints, and verify behavior as well as presence. Apply this only where relevant; a narrow fix stays narrow. This principle does not require an 11-star exercise or a numeric taste score.

Before `ce-work` or a generated builder starts, produce `engineering/ENGINEERING_PLAN.md` through `ce-plan` or an equivalent implementation-plan doc.

The plan must include:

- requirements trace to launch docs and `state/LAUNCH_TRACE.md` IDs
- 11-star complete product experience, line of feasibility, and magical-moment proof requirements
- `state/business-state.json` phase, autonomy mode, active blockers, and failure cards that constrain implementation
- `engineering/TECH_SPEC.md` pointer or inline technical contracts when data/API/state/integration behavior is in scope
- `product/copy/COPY_DECK.md` coverage for every screen the units build, and the string-externalization mechanism from `engineering/TECH_SPEC.md` §Strings And Localization Readiness
- [`premium-mobile-craft.md`](../../../knowledge/design/premium-mobile-craft.md) acceptance-criteria coverage for every screen the units build — press states, motion, haptics, loading/empty states — the same per-screen bar the COPY_DECK.md line above already sets for copy
- implementation units with repo-relative file paths
- a short decision entry for each non-obvious architecture or data-model choice: the option chosen, the option rejected, and the reason, kept in this plan or a linked `engineering/DECISIONS.md`
- orchestration strategy, candidate units, safe parallel lanes, serialized lanes, worktree needs, shared resources, and subagent forbidden actions from `operations/ORCHESTRATION.md`
- frontend, backend, database, analytics, revenue, email, and store-console impacts
- secret impacts: new secret or env var, secret class, Doppler/provider routing, service token/provider-integration plan, CI/deploy injection, `.env.example` names-only updates, and bundle-safety checks
- feature flags or rollout controls
- migration and data-backfill plan when needed
- auth/session, permission, app integrity, API/RPC/webhook, and state-machine impacts when relevant
- test scenarios for happy path, edge cases, error paths, and integration paths
- MobAI/native iOS/device-test scenarios for mobile user journeys, plus XcodeBuildMCP/SnapshotPreviews/serve-sim scenarios when they are the Apple-platform proof route
- backend verification scenarios showing real test data persisted or projected correctly
- production-readiness gates and known blockers
- validator and LaunchBench checks that must pass before done

Do not put unsupported product behavior into `engineering/ENGINEERING_PLAN.md`. Send unresolved product questions back to `ce-brainstorm` or make explicit assumptions.

## Load only what the task needs

[Task inputs, outputs, checks, and knowledge selectors](references/task.md) supplies the canonical details when they are needed. Open the specific referenced sections, not the whole library. In connected knowledge retrieval, follow exact section selectors, revision hashes, and continuation calls. Unresolved guidance remains unresolved.

## Tools and evidence

Keep the method independent of the agent host and business provider. Honor explicit selections. Use already available, authorized tools that implement the required operation; do not infer availability from the agent's name or silently substitute a provider. Load a provider's procedure only when its action is current. Record missing capabilities without inventing provider proof.

Pause for access or secrets, spend, pricing or legal decisions, destructive changes, hosted deployment, store submission, or production release. Guidance is not permission. A proposed price is not an approved price, and a mock is not live evidence.

## Return

Report findings or changes, the evidence inspected, applicable checks actually run, unresolved requirements, and the next decision. Label advisory findings separately from accepted business evidence. Do not record business completion or modify reducer-owned state outside the supported runtime.
