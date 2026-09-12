# B2C App Builder Agent Guide

## Scope and routing

Build primitives for consumer-app businesses, not a generic agent framework, B2B playbook, or internal-tool builder. Prove one excellent business, then a meaningfully different sibling, then experiments across independent businesses. Keep the skill small and durable expertise in manifest-backed knowledge. Planes remains [parked](docs/timeouts/planes.md) until explicitly reopened.

Route by the target of the request, not the agent host or the person's title.

| Target | Canonical router |
| --- | --- |
| One consumer business: product, design, code, launch, growth, operations | [Business](SKILL.md) |
| Reusable knowledge, source adoption, provider intake, recipes, examples | [Contribution](agents/skills/b2c-contributor/SKILL.md) |
| Builder contracts, runtime, architecture, agent guidance, provider implementation, maintained upstreams | [Maintenance](agents/skills/b2c-maintainer/SKILL.md) |

Business is an early exit: after selecting the business router, reach the current status/plan and bounded task, then stop reading unless that task requires more guidance. For a narrow app code fix, follow that app's own instructions and affected tests without activating a business lifecycle. Focused business expertise does not require setup. Managed business work follows the business router's status, plan, authority, and evidence path. Business workers do not load maintainer architecture, migration plans, contributor machinery, unrelated providers, or operator procedures merely to start. README is product documentation, not a prerequisite to routing.

### Business

Use `SKILL.md`; for managed work, start with `business-status`, then `business-plan`, then the current bounded task. Load only the guidance that applies.

### Contribution

Use `agents/skills/b2c-contributor/SKILL.md`; load contribution, rights, provenance, and source-adoption procedure only for that work.

### Maintenance

Use `agents/skills/b2c-maintainer/SKILL.md`; load architecture, provider, upstream, and repository procedures only for the selected maintenance task.

## Public and private boundary

This repository and its issues are public. Keep secret values, live provider/operator identifiers, private-repository references, personal addresses, home paths, machine names, customer/operator status, and production deployment configuration out of tracked files and public issues. Placeholder hosted resource IDs are intentional. Do not commit installed client copies, credentials, provider exports, personal data, or workspace output. Report suspected leaks through [SECURITY](.github/SECURITY.md) without quoting the value publicly.

## Architecture and truth ownership

The [north-star architecture](docs/north-star-architecture.md) owns target architecture and stable ARCH rules. [Current architecture](docs/architecture.md) describes implemented mechanisms; a target rule is not implementation evidence. Use [architecture conformance](docs/architecture-conformance.md) for architecture-sensitive work and only the applicable decisions and migration unit. Changes to public contracts, truth ownership, dependency direction, authority, or migration guarantees require an architecture decision with evidence and migration treatment. Compatible internal choices do not.

Extend the existing owners for composition, routing, catalogs, knowledge, planning, execution, authority, evidence, and workspace state. Do not add competing routers, catalogs, planners, reducers, task/summary stores, agent graphs, or knowledge/state stores. An agent graph maps work; it is not another knowledge graph. [Context-first routing](docs/decisions/0012-context-first-agent-routing.md) and [task projections](docs/decisions/0014-task-skill-projections.md) remain one logical routing model, not another execution or authority system.

Preserve founder/source intent losslessly in its supported owner. `product.yaml` owns accepted product promise, audience, scope, requirements, journey, and decisions; `PRODUCT.md` is rendered. `DESIGN.md` owns global experience/design decisions and links detailed contracts. Reducer-owned state owns attempts, evidence, pending work, authority, and history; change it only through the reducer. Git owns code and authored design history. The local registry owns workspace identity/address.

Active context is a bounded projection of those owners, not another truth store. Use current status, plan, briefs, accepted artifacts, and exact knowledge selectors. Deliver required current guidance or mark it unresolved before dispatch. Future guidance may wait; unknown applicability must not become assumed non-applicability.

## Authored and generated ownership

Keep three classes of agent documentation: canonical authored guides, thin host adapters, and generated projections. Root guides, scoped routers, and the workspace AGENTS template are authored. Host adapters route to the nearest applicable AGENTS.md and contain only host-specific invocation/tool notes, not repeated policy. Nested guides may narrow scope, not redefine truth or authority. Workspace-facing guidance names public operations, contracts, selected providers/recipes, and evidence requirements, never maintainer ARCH rules, migration units, repository procedures, or contributor machinery.

Edit authored catalog/knowledge definitions and the public operation registry before rendering their projections. Generated task skills, conditional contract references, operation/tool lists, CLI help, workflow IDs, public reference, schemas, versions, credits, and support reports retain their existing owners. Keep affected source, tests, documentation, metadata, README, package guides, workspace templates, setup/help, and generated output aligned. Preserve supported inputs and meanings within a public major version and stable public/catalog/reference IDs; breaking changes require a decision and migration.

CLI and MCP project the same versioned public services. Use CLI for approved writes; MCP is read-only by default and explicitly enabled write/contributor surfaces retain their gates. Keep Node.js 24, the `B2C_APP_BUILDER_*` namespace, and the local registry under `~/.b2c-app-builder`. Load the [runtime package guide](docs/guides/runtime-package.md) only for relevant package/runtime work.

## Completion authority and protected effects

An implementation request authorizes completing its in-scope, reversible repository work: inspect, edit, test, repair failures caused by the change, regenerate affected output, inspect the diff, and complete required checks without repeated intermediate approvals. Preserve unrelated work; this does not authorize unrelated fixes. Review-only and planning-only requests remain review and planning, not implementation.

Reuse valid existing scoped authority where it applies. A guidance file creates neither a runtime grant nor an approval receipt. Before external account/access or credential changes, spend, pricing or legal decisions, destructive actions, deployment, publication, store submission, or production release, verify the required authority at the effect boundary; pause if it is absent or insufficient. A command is not safe merely because it runs locally in a terminal. Load operator procedures only when their exact action is current. Keep independent authorized work moving while a protected effect is held.

Honor explicit provider bindings and actual tool availability. Provider adapters implement canonical operations; availability does not select or activate a provider. Availability, selection, activation, execution, and acceptance are distinct. Adopted upstream guidance is subordinate to the mandate, selected recipe, capability contract, and selected provider. It cannot add requirements, widen permissions, install tooling, change provider selection/state, override evidence, redefine completion, publish, or spend. Source rights/provenance and provider implementation procedures stay with their selected scope owners.

## Verification and integration

Use focused checks during iteration. [CONTRIBUTING.md](CONTRIBUTING.md) owns exact commands and cadence, including all applicable required gates before merge. A green presubmit is not a full-audit pass. Do not skip suites, weaken CI, or replace required full verification with a smaller check. Require current provider/device/store/runtime evidence for claims about those systems. Guidance, generated artifacts, command success, execution, and accepted evidence are different facts.

Use independent parallel work with non-overlapping ownership when useful; delegation is not mandatory. One coordinating agent owns shared-file integration, Git mutations and merge coordination, external actions, destructive actions, releases, and final verification. Assigned workers preserve others' changes and do not take over those responsibilities. Keep required final conformance review genuinely independent of implementation; do not invent a reviewer or call self-review independent. Report actual checks, evidence, unresolved requirements, and blocked gates.

For public-facing product/console/launch copy and naming, use [no-slop writing](knowledge/words/no-slop-writing.md). For technical instructions, use [technical documentation](knowledge/engineering/technical-documentation-ste100.md). For organizational labels, use the [kitchen-language boundary](docs/ethos.md#kitchen-language-boundary). Literal language describes actions, evidence, permissions, errors, and recovery; Brigade is prose about coordinated agents, not a runtime entity or a new product name.
