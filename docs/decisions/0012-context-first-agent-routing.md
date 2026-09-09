# ADR-0012: Context-first agent routing and thin host adapters

- **Status:** accepted
- **Date:** 2026-09-09
- **Steward:** repository maintainer
- **Affected rules:** ARCH-02, ARCH-07, ARCH-09, ARCH-11
- **Related issues:** #68, #71, #73, #75, #122, #124, #125, #126, #127

## Context

The repository already separates business, contribution, and maintenance scopes, and already has bounded planning and knowledge primitives. The remaining failure mode is agent context: a business worker can still be led through repository architecture, composition mechanics, broad reference inventories, or operator procedure before it reaches the current business task.

A second failure mode is adapter drift. `AGENTS.md` is the canonical repository contract, while `CLAUDE.md` and other host files are adapters. If an adapter restates repository architecture or lifecycle rules, it becomes a competing instruction source and eventually diverges.

The After Credits first-run regression and issues #125-#127 make these boundaries concrete. Source intent must be preserved without being injected everywhere; current work must be projected from existing planner truth; local execution and hosted knowledge must remain distinguishable.

## Decision

### 1. Route before reading broadly

Every agent first classifies the intended target as **business**, **contribution**, or **maintenance**. The scope determines the router and the allowed default context.

For **business** work, `SKILL.md` is the early exit. The agent proceeds to the supported business lifecycle, current `business-plan`, and its bounded ready/held projection. It does not read maintainer architecture, migration plans, repository source maps, contribution machinery, or unrelated provider guidance unless the current bounded task requires one of those contracts.

For **contribution** and **maintenance**, use their canonical routers. Those scopes may load architecture and repository internals because changing the builder is their task.

### 2. Preserve source intent, project active context

A founder brief, accepted `product.yaml`, `DESIGN.md`, reducer state, and other authoritative artifacts remain durable truth in their existing owners. Active worker context is a projection of that truth, not another truth store.

The worker receives the smallest complete packet needed for the current task: task identity, why it is ready, relevant accepted requirements with provenance, allowed scope, required knowledge selectors, selected provider facts when applicable, effect/authority boundary, outputs, verification, holds, and continuation.

Do not solve context pressure by truncating or rewriting source intent. Do not solve source preservation by injecting the complete source into every worker. Do not add another planner, task database, summary store, agent graph, or retrieval engine when the existing planner/brief/knowledge owners can project the needed facts.

### 3. Current guidance is different from future guidance

A reference required by a future workflow can remain a dependency without entering the current worker prompt. Required guidance for the current task must be delivered or explicitly unresolved before dispatch. Unknown applicability remains unknown; context reduction may not silently suppress a requirement.

Selected artifact specification sections outrank broad introductions. Selected provider instructions are loaded only for operations bound to that provider. Upstream/package instructions remain subordinate to the mandate, selected recipe, capability contract, and selected provider.

### 4. Operator procedure appears at the effect boundary

Secret installation, founder-key procedure, provider setup, package activation, deployment, publication, spend, legal action, destructive action, and other protected procedures enter context only when that exact action is current and authorized to be prepared or performed.

A business worker may report that approval or setup is required and continue independent ready work. It does not need a tutorial on the authority mechanism merely to discover that a hold exists.

### 5. Host files are thin adapters

`AGENTS.md` is the canonical cross-agent repository contract. `CLAUDE.md`, Cursor rules, and future host-specific files must begin by routing to `AGENTS.md` and may contain only host-specific invocation or tool notes.

They must not restate architecture rules, lifecycle semantics, public operation ownership, provider-selection rules, or business requirements. If a host needs different behavior, express the difference as a host invocation constraint while keeping repository semantics in the canonical router/contract.

This follows the agents.md pattern: one portable repository guide, thin tool-specific adapters, and directory-local guidance only where scope genuinely narrows.

### 6. Directory-local guidance narrows, never competes

Nested `AGENTS.md` files may add rules for a subtree when the work there has genuinely narrower constraints. They inherit the root contract and may not redefine repository-wide ownership or authority. Prefer a canonical scoped router over duplicating instructions in multiple directories.

Workspace templates follow the same pattern: workspace `AGENTS.md` owns portable business-agent guidance; workspace `CLAUDE.md` and Cursor rules point to it and add host-only notes. Maintainer rules must not leak into generated business workspaces.

## Consequences

- Business agents should reach useful work with less framework narration and fewer unrelated reads.
- Maintainer and contributor depth remains available when that is the actual scope.
- Source preservation and active-context size become separate concerns.
- Host adapters become safer to add because they cannot create a parallel architecture.
- Context optimization must be measured against requirement preservation, not prompt size alone.

## Verification

`npm run check:agent-entrypoints` must enforce at least:

1. root `CLAUDE.md` routes to root `AGENTS.md`;
2. workspace host adapters route to workspace `AGENTS.md`;
3. thin adapters do not reproduce canonical architecture sections or `ARCH-xx` policy;
4. business workspace guidance does not expose maintainer roadmap, contributor machinery, or private/operator procedure;
5. a clean business entrypoint can discover the supported lifecycle and current bounded work without reading maintainer architecture first.

Changes to routing must include a focused business-entry regression plus the normal agent-entrypoint check. Context reductions must retain accepted requirements, authority boundaries, evidence obligations, and truthful unknowns.

## Non-goals

This ADR does not rename machine contracts, add hosted execution, change authority, replace the planner, merge workflows, or define the final local-vs-hosted connection names. Those remain with their existing contracts and issues.