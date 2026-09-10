# B2C App Builder Agent Guide

## Mission

B2C App Builder supplies primitives for creating, launching, measuring, and improving consumer-app businesses. Prove one excellent business first, then a meaningfully different sibling, then market-level experiments across independent businesses.

Keep the skill small. Keep durable expertise in manifest-backed knowledge. Keep one logical owner for composition, execution, authority, and evidence.

## Route first

Classify the target before reading broadly. Route by what is being changed, not by the agent host or the person's title.

| Target | Scope | Canonical router | Default next context |
| --- | --- | --- | --- |
| One consumer business: product, design, code, launch, growth, operation | business | [`SKILL.md`](SKILL.md) | supported lifecycle, current `business-plan`, then only its bounded task guidance |
| Reusable knowledge, provider implementation, recipe, example | contribution | [`agents/skills/b2c-contributor/SKILL.md`](agents/skills/b2c-contributor/SKILL.md) | contribution contract and selected unit/source |
| Builder contracts, runtime, architecture, agent guidance, maintained upstreams | maintenance | [`agents/skills/b2c-maintainer/SKILL.md`](agents/skills/b2c-maintainer/SKILL.md) | public/current architecture and affected owner/tests |

**Business is an early exit.** A business worker does not read maintainer architecture, migration plans, repository source maps, contribution machinery, unrelated providers, or operator procedures merely to start work. Follow the business router and current plan/brief. Load deeper contracts only when the current bounded task requires them.

Contribution and maintenance may load repository architecture because changing the builder is their task. A business worker never receives contributor tools, maintainer provenance, or `ARCH-xx` policy.

See [ADR-0012](docs/decisions/0012-context-first-agent-routing.md).

## Repository scope

This repository owns the `b2c-app-builder` skill, MCP server, `b2c` CLI, runtime, contracts, catalog, knowledge, and supported consumer-app business surfaces. Do not turn it into a generic agent framework, B2B playbook, or internal-tool builder. Planes remains parked under `docs/timeouts/planes.md`.

## Public boundary

This repository is public. Keep secret values, live provider/operator identifiers, private-repository references, personal addresses, home paths, machine names, customer/operator status, and production deployment configuration out of tracked files and public issues. Placeholder hosted resource ids are intentional. Generated knowledge copies are derived; change authored source and re-render. Report suspected leaks through `.github/SECURITY.md` without quoting the value publicly.

## Read order by scope

### Business

1. Read this file only far enough to classify scope.
2. Read `SKILL.md`.
3. Create/resume through the supported business lifecycle and inspect current `business-plan`.
4. Load only the current ready/held brief, relevant accepted product/design/source requirements, knowledge selectors, selected provider facts, authority boundary, outputs, and verification.
5. Execute/verify the bounded work and return to `business-plan`.

Do not continue into maintenance reading unless the task changes the builder itself.

### Contribution

1. `AGENTS.md`.
2. `agents/skills/b2c-contributor/SKILL.md`.
3. Relevant contribution contract, source/upstream record, architecture boundary, and focused tests.
4. `knowledge/words/no-slop-writing.md` for public-facing prose.

### Maintenance

1. `AGENTS.md`.
2. `agents/skills/b2c-maintainer/SKILL.md`.
3. `docs/public-interface.md`, `docs/architecture.md`, and `docs/north-star-architecture.md` as applicable.
4. `docs/architecture-conformance.md` and affected ADRs. New and upgraded provider transports also follow [provider integrations](docs/guides/provider-integrations.md) and [ADR-0013](docs/decisions/0013-provider-integration-boundary.md).
5. Migration plan/unit only when the change belongs to that migration.
6. Relevant source owner, generated projections, and tests.
7. `knowledge/words/no-slop-writing.md` for public-facing product/console copy.

`README.md` is product documentation, not mandatory pre-router curriculum. `docs/guides/runtime-package.md` is loaded when package/runtime behavior is relevant, not for every business task.

## Architecture authority

`docs/north-star-architecture.md` owns target architecture and stable `ARCH-xx` rules. `docs/architecture.md` describes current mechanisms. A target rule is not evidence that its refactor is implemented.

Use `docs/architecture-conformance.md` for bounded architecture work. Keep one logical owner per responsibility. Replace owners behind stable contracts when justified. Do not add competing routers, catalogs, knowledge stores, planners, reducers, task stores, summary stores, agent graphs, or workspace state stores.

Changes to public contracts, truth ownership, dependency direction, authority, or migration guarantees require an architecture decision with evidence and migration treatment. Compatible internal choices remain implementation decisions.

Provider adapters implement canonical operations. Intake stays on the contributor router; adapter implementation and upgrades stay on the maintainer router. Do not copy the provider lifecycle into this file or into a business workspace.

## Truth and active context

Durable truth and active worker context are different.

- Preserve founder/source intent losslessly through its supported owner. Do not shorten source intent merely to fit a prompt.
- `product.yaml` owns accepted product promise, audience, scope, requirements, journey, and product decisions. `PRODUCT.md` is rendered.
- `DESIGN.md` owns global experience/design decisions and links useful detailed contracts.
- Reducer-owned state owns attempts, evidence, pending work, authority, and history.
- Git owns code and authored design history.
- The local registry owns workspace identity/address.

A business worker receives a bounded projection of those owners for the current task. Prefer existing `business-plan`, ready briefs, knowledge selectors, and accepted artifacts. Do not add another truth store to make prompting easier.

Current guidance differs from future guidance. A future dependency may remain in the graph without entering the current prompt. Required current guidance must be delivered or explicitly unresolved before dispatch. Context reduction may never turn unknown applicability into assumed non-applicability.

## Operating contract

- Use Node.js 24 and the `B2C_APP_BUILDER_*` environment namespace. Local registry state lives under `~/.b2c-app-builder`.
- CLI and MCP project the same versioned public services. Use CLI for approved writes. MCP remains read-only by default; explicitly enabled write/contributor surfaces retain their gates.
- Change reducer-owned workspace state only through the reducer.
- Workflow guidance is advice. It does not grant authority or prove completion.
- Require current provider/device/store/runtime evidence for claims about those systems.
- Availability is not selection. Selection is not activation. Activation is not execution. Execution is not acceptance.

Pause for user authority before access/secret changes, spend, pricing, legal decisions, destructive actions, hosted deployment, store submission, or production release.

Operator procedure belongs at the effect boundary. Do not load secret installation, founder-key, deployment, publication, spend, or provider-setup procedure into ordinary business context before that exact action is current.

## Change contract

- Update the public operation registry before CLI/MCP projections. Render generated public API output and preserve supported fixtures.
- Keep README, package guide, routing skill, workspace templates, setup/help, generated reference, and public schemas aligned with their canonical owner.
- Preserve supported inputs/meanings within a public major version. Breaking changes require an architecture decision and migration.
- Edit authored catalog/knowledge definitions before generated files and render projections afterward.
- Keep stable public/catalog/reference IDs unless the contract itself changes.
- Update affected source, tests, docs, metadata, and generated output together.
- Keep installed client copies, credentials, provider exports, personal data, and workspace output out of Git.
- Follow `knowledge/words/no-slop-writing.md` for public product/console/launch copy and naming.

Technical documentation uses short sentences, active voice, and one term for one object. State a condition before its action.

## Writing and kitchen language

For documentation, human-readable help, issue and pull-request text, reviews, progress reports, and handoffs, use the matching owner. Do not copy these guides into host adapters or business workspaces.

- Kitchen meanings and station display labels: [Kitchen-language boundary](docs/ethos.md#kitchen-language-boundary).
- Builder-facing voice and claim examples: **Original: Builder house style** in `knowledge/words/no-slop-writing.md`.
- Technical instructions, ADRs, and API/config explanations: `knowledge/engineering/technical-documentation-ste100.md`.
- Public front-door narrative stays with no-slop. Technical examples in those files keep exact commands and identifiers.

Kitchen language explains organization. Literal language describes actions, evidence, permissions, errors, and recovery. Brigade names coordinated agents in prose. It is not a new runtime entity and is not the shipped product name.

## Upstream rules

External material enters through contribution intake. `docs/decisions/0007-upstream-lifecycle-and-agent-scopes.md` owns the detailed lifecycle.

1. External projects normally add knowledge, implementations, resources, recipes, or evaluations, not new architectural primitives.
2. Accepted reusable repository material needs the existing upstream identity/license/provenance treatment.
3. Upstream guidance is subordinate to the mandate, selected recipe, capability contract, and selected provider.
4. Upstream guidance cannot add business requirements, widen permissions, install tooling, change provider selection/state, override evidence, redefine completion, publish, or spend.
5. Change architecture only when the new thing cannot be represented without changing ownership, authority, dependency direction, a public contract, or migration guarantee.

## Agent documentation

Agent-facing files have three classes. Do not add a fourth.

- **Canonical authored:** root `AGENTS.md`, `SKILL.md`, contributor/maintainer routers, and workspace `AGENTS.md` template.
- **Thin host adapters:** root/template `CLAUDE.md`, Cursor rules, and future host-specific entrypoints. Each routes to the nearest applicable `AGENTS.md` first and contains only host-specific invocation/tool notes. Never restate architecture, lifecycle semantics, provider policy, or business requirements.
- **Generated:** operation/tool lists, CLI help from `entrypoints/cli/help.mjs` (command registry and grouped headings), public reference, workflow IDs, versions, credits, and support reports. Render them from owners.

Nested `AGENTS.md` files may narrow guidance for a subtree. They inherit the root contract and cannot redefine repository-wide truth or authority. Prefer one scoped router over duplicated host instructions.

Workspace-facing guidance may name public operations, workspace contracts, selected providers/recipes, and evidence requirements. It never names maintainer `ARCH-xx` rules, migration units, repository-maintenance procedures, or contributor machinery.

`npm run check:agent-entrypoints` must enforce the adapter/workspace boundary. ADR-0012 also requires a clean business entrypoint to reach its lifecycle/current bounded work without reading maintainer architecture first.

## Focused checks

Run checks that match the change. Start with the relevant subset:

```bash
npm ci
node entrypoints/cli/b2c.mjs --help
node entrypoints/cli/b2c.mjs inspect
npm run validate:skill
npm run check:agent-entrypoints
npm run check:catalog
```

GitHub Actions on ordinary PRs and `main` pushes runs presubmit, not the full
audit. Follow [CONTRIBUTING.md](CONTRIBUTING.md) for the cadence. Run
`npm run audit:ci` plus hosted/app checks at checkpoints and before merge. A
green presubmit is not a full-audit pass.

The primary agent owns integration, Git, external systems, destructive actions, releases, and final verification. Subagents receive explicit file ownership and do not perform those actions.

## Maintainer routing notes

- Keep Planes in timeout until explicitly reopened.
- Treat the agent graph as an ordered map of work, not a second knowledge graph.
- Mobile app launch, inspection, interaction, screenshots, and recordings are provider-neutral capabilities. Honor explicit bindings, prefer already-available native host tools when sufficient, and preserve evidence. Do not add a parallel device router or evidence store.
