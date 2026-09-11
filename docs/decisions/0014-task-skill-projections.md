# ADR-0014: Task skills are catalog projections

Status: Accepted
Date: 2026-09-11
Scope: Business entrypoints, public navigation, and optional guidance distribution
Related: ADR-0012, ADR-0013; issues #75 and #126

## Problem

The README exposes six business areas, while knowledge folders and catalog authority groups expose different vocabularies. The root skill also loads setup, composition, and recovery details for focused questions that need none of them. Turning every knowledge document or internal execution node into a skill would multiply entrypoints without fixing ownership.

## Decision

Keep one canonical catalog and knowledge index. Add presentation-only task descriptors in `catalog/task-skills.ts`. Each descriptor names an existing workflow and, where appropriate, its existing authored group. Descriptors own only the task's public name, description, and binding. They cannot own instructions, outputs, gates, dependencies, providers, state, or completion rules.

Render task `SKILL.md` files and conditional contract references from those owners under `agents/skills/`. The first release exposes opportunity research, onboarding design/review, and monetization review. ONB-00 through ONB-22 remain internal work units of one task skill. The main business skill remains the default entrypoint. Optional task installation does not introduce a fourth agent scope.

`catalog/areas.ts` owns the six public business-area labels and their mapping to existing domains. Public navigation uses this presentation everywhere. Existing area/domain IDs remain unchanged because they also participate in authority and execution contracts. Physical knowledge paths do not need to move to provide coherent public navigation.

"One router" means one logical routing and execution model, not exactly one file named SKILL.md. Multiple generated entrypoints are allowed. A task skill cannot schedule work, grant authority, write reducer state, select a provider silently, or establish runtime acceptance. Managed work returns to business-status and business-plan. Focused advisory work does not require a workspace or the runtime.

## Provider and host boundaries

Core task methods express consumer-business semantics. Selected-provider commands and constraints remain in the provider references and adapters. The default recipe may remain opinionated. No vendor payload types, host-specific invocation names, or tool grants enter portable task metadata. Explicit provider bindings and actual tool availability remain authoritative.

The root skill links setup, lifecycle/recovery, composition, and mobile-operation procedures conditionally. Their detail is not part of every task's startup context. Thin host adapters still route through AGENTS.md without duplicating business policy.

## Distribution

The source checkout renders task contracts that link to authored knowledge. `skills:export` creates a separate, relocatable guidance directory with bound references, linked manifest-backed knowledge, source hashes, the repository license, and full third-party notices. These are generated copies, never new authoring owners. Supplemental repository links are pinned to a source commit and require network access. The exporter does not claim that all linked external material is available offline.

Exports are create-only and reject escaping paths, unknown task names, and symlinked sources or destinations. They contain no execution runtime, provider connections, secrets, installed agent configuration, contributor router, or maintainer router. Installing or upgrading a skill remains an explicit operator action. The export manifest describes a guidance snapshot, not business state or accepted evidence.

## Compatibility and migration

No public operation, workflow/reference ID, dependency, provider binding, reducer contract, workspace pin, or acceptance rule is renamed or removed. No mass knowledge-file migration is included. Root instructions move to conditional references without dropping their contracts. Selected task methods remove provider-specific setup prose while retaining the existing provider references and default recipe bindings.

The generated skill projection and public navigation renderers join render:all and the agent-entrypoint gate. Distribution includes only business task directories and root procedure references, not all of agents/skills.

## Evidence and limits

Deterministic tests verify public-area coverage, exact catalog instruction projection, reference identity, context-size budgets, selected-provider independence, generated drift, preserved onboarding group membership, relocatable exports, notices, resource hashes, and create-only path safety. Existing full CI remains required.

These tests are not evidence that a live agent selected or applied a skill correctly. The behavioral corpus supplies held-out prompts for the existing authorized evaluation harness. Real model/tool traces, token usage, and independent output quality require the separately budgeted work in #75. Do not close that evaluation issue based on deterministic checks.

## Rejected alternatives

- Renaming every knowledge file to SKILL.md: confuses references, procedures, contracts, and jobs.
- One independently authored skill per execution node: duplicates internal scheduling and overloads discovery.
- A parallel skill workflow engine: duplicates catalog, authority, and acceptance ownership.
- Installing every task and provider skill by default: unnecessary discovery and startup context.
- Moving all knowledge paths in the first release: increases migration risk before validating the navigation benefit.
