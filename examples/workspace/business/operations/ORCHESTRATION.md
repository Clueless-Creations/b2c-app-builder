# Orchestration

## Orchestration Preflight

Current objective:

Critical path the orchestrator will keep locally:

Parallelism decision:

Strategy: `not_evaluated`

Rationale:

Manager pattern: one orchestrator owns user thread, state, integration, git, provider mutations, and release decisions.

Subagent availability:

Dispatch reason when no specialist is started:

If broad work is kept inline, record why specialists are unavailable, unsafe, or not useful. Do not leave both the dispatch record and the reason empty.

## Session Continuity

Last state review:

Continuity source set: `AGENTS.md`, `product.yaml`, `DESIGN.md`, `state/business-state.json`, `operations/BUSINESS_ACCESS.md`, `operations/business-access.json`, `operations/AGENT_OPERATIONS.md`, `operations/agent-operations.json`, `operations/ORCHESTRATION.md`, `engineering/PRODUCTION_READINESS.md`, `operations/FAILURE_CARDS.md`

Memory policy: Do not rely on chat memory or prior transcripts as source truth; if they conflict with repo state, repo state wins.

Git status reviewed:

Drift risks or stale assumptions:

Next action:

State reconciliation needed:

## Compound Engineering Routing

Availability:

CE freshness check:

CE skill inventory:

Route:

- `ce-update` or latest-release fallback:
- `ce-brainstorm`:
- `ce-plan`:
- `ce-work`:
- `ce-worktree`:
- `ce-code-review`:
- `ce-test-browser` / `ce-test-xcode` / MobAI:
- `ce-proof` / `ce-demo-reel`:

Fallback reason if unavailable:

## Candidate Units

| ID            | Role           | Objective                                                                  | Mode      | Files                                                                                   | Shared resources | Parallel safe | Status  |
| ------------- | -------------- | -------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------- | ---------------- | ------------- | ------- |
| product-audit | product leader | Audit scope, 11-star experience, onboarding, activation, and traceability. | read_only | `PRODUCT.md`, `11_STAR_EXPERIENCE.md`, `product/ONBOARDING.md`, `state/LAUNCH_TRACE.md` | none             | yes           | pending |

## Parallel Safety Check

File-overlap check:

Shared mutable resources:

Units forced to serialize:

Worktree isolation needed:

## File Ownership

The reducer owns `state/business-state.json`. The orchestrator coordinates its authorized transitions and owns `operations/BUSINESS_ACCESS.md`, `operations/business-access.json`, `operations/AGENT_OPERATIONS.md`, `operations/agent-operations.json`, `operations/ORCHESTRATION.md`, `engineering/ENGINEERING_PLAN.md`, `engineering/PRODUCTION_READINESS.md`, failure cards, git, and release coordination.

Specialists may edit only the file paths assigned in their prompt. Read-only auditors do not edit files.

## Serialized Work

- Provider/account mutations
- Founder gates, business identity, account creation/delegation, recovery, and 2FA
- Authenticated browser profiles, public replies/posts, and external action ledgers
- Credentials and secrets
- MobAI, simulator, or device control on the same target
- Git staging, commits, merges, pushes, tags, and releases
- App Store, Google Play, social posting, pricing, legal approval, and final launch decisions

## Subagent Instructions

All specialists receive a predetermined role prompt from `APP_AGENTS.md` and this bounded assignment:

```text
You are not alone in this repo. Do not revert or overwrite work by other agents.
Allowed write scope: read-only unless a specific path list is assigned.
Forbidden actions: do not stage files, commit, push, merge, run project-wide suites, mutate providers, change credentials, post publicly, submit builds, or make founder-only decisions.
Return only this handoff: Scope reviewed; Evidence; Findings; Recommendations; Files changed; Validation; Risks and blockers; Proposed state patch; Knowledge receipt.
```

## Integration Plan

After subagents return, the orchestrator reviews outputs, compares actual modified files, accepts or rejects findings, updates state, runs focused validators, then runs the full relevant suite.

## Verification

Focused validators:

Full suites:

Proof paths:

## Founder-Only Gates

- Spending, paid subscriptions, paid render infrastructure, and creator payments
- Credentials, account access, provider connections, and secret changes
- Pricing, legal acceptance, public claims, app-store submission, public posting, scheduling, and destructive repo actions

## State Updates

Update this coordination record after preflight, dispatch, integration, and before launch-ready claims. Use the session and work-order operations for execution. Reconcile lane status, evidence, and blockers through authorized reducer transitions in `state/business-state.json`.

After material state changes, report the verified result, next action, and required human decisions.

## Review Ledger

Every producer-to-auditor pair is one row. The producer never accepts its own surface, and a surface with no row is not done. Verdict is `pending`, `pass`, `fail`, or `blocked`; a `pass` or `fail` names the rubric version and a findings artifact that exists in the workspace. See `reference.orchestration.isolated-review`.

| Surface | Producer | Auditor | Rubric | Verdict | Findings artifact | Date |
| ------- | -------- | ------- | ------ | ------- | ----------------- | ---- |

## Failure Cards

Create or update a failure card when:

- parallel safety is unclear
- a subagent finds a launch-grade gap
- actual modified files collide
- a founder-only gate blocks progress
- validators fail or proof is missing
